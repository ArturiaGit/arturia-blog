---
title: 'AvaloniaAOT: ArturiaLink Native AOT 发布踩坑实录'
cover: /img/bg/avaloniaaot-cover.webp
abbrlink: b7d2ek9n
date: 2026-07-19 12:44:29
categories:
  - Avalonia
tags:
  - Avalonia
  - NativeAOT
  - LiteDB
  - JSON
  - C#
glossary:
  NativeAOT:
    title: Native AOT
    brief: .NET 原生预编译技术，将托管应用编译为目标平台原生代码，消除 JIT 延迟并实现自包含部署。
  Avalonia:
    title: Avalonia
    brief: 跨平台 .NET UI 框架，支持 Windows、macOS、Linux 等平台，使用 XAML 描述界面。
  LiteDB:
    title: LiteDB
    brief: 嵌入式 NoSQL 文档数据库，单文件存储，使用 BSON 格式，适用于桌面客户端本地持久化。
  DPAPI:
    title: Windows Data Protection API
    brief: Windows 内置的数据保护接口，基于用户凭据对数据进行加密，常用于桌面应用本地敏感信息保护。
  BSON:
    title: BSON
    brief: Binary JSON 的简称，LiteDB 使用的二进制序列化格式，比 JSON 更紧凑并支持更多数据类型。
  JsonSerializerContext:
    title: JsonSerializerContext
    brief: .NET 源生成 JSON 序列化上下文，编译期生成类型元数据以替代运行时反射，是 System.Text.Json AOT 兼容的核心机制。
  ReflectionBinding:
    title: ReflectionBinding
    brief: Avalonia 中基于运行时反射的数据绑定方式，依赖字符串路径在控件树中查找绑定源，在 AOT 裁剪环境中可能失效。
  POCO:
    title: POCO
    brief: Plain Old CLR Object，不依赖框架基类或特性的普通 .NET 对象，LiteDB 通过 BsonMapper 将其映射为 BSON 文档。
  MVVM:
    title: MVVM
    brief: Model-View-ViewModel 架构模式，将 UI 逻辑与展示状态分离，通过数据绑定实现视图与视图模型的解耦。
  MSVC:
    title: MSVC
    brief: Microsoft Visual C++ 工具链，包含 link.exe 链接器和 Windows SDK，Windows Native AOT 编译依赖其生成最终可执行文件。
  ReadyToRun:
    title: ReadyToRun
    brief: .NET 预编译技术，为部分程序集提前生成本机代码以加速启动，但仍依赖完整 .NET 运行时。
  BsonMapper:
    title: BsonMapper
    brief: LiteDB 的对象映射器，负责在 POCO 与 BSON 文档之间进行转换，依赖运行时代码生成或反射分析实体结构。
  SystemTextJson:
    title: System.Text.Json
    brief: .NET 内置的高性能 JSON 序列化库，在 AOT 环境中需配合 JsonSerializerContext 源生成器以消除运行时反射。
  Skia:
    title: Skia
    brief: 开源 2D 图形库，Avalonia 使用其作为跨平台渲染后端之一，发布时需随附原生 Skia 库文件。
  HarfBuzz:
    title: HarfBuzz
    brief: 开源文本整形引擎，负责复杂文字排版，Avalonia 发布时需随附原生 HarfBuzz 库文件。
  JsonTypeInfo:
    title: JsonTypeInfo
    brief: .NET JSON 源生成器的类型元数据载体，序列化/反序列化时替代运行时反射，是 AOT 兼容的关键参数。
---

ArturiaLink 是一个基于 .NET 10 和 [[Avalonia]] 12 的桌面短链客户端。为了让 Windows 客户端以自包含方式交付，并探索更直接的启动和部署体验，我尝试把客户端发布为 `win-x64` [[NativeAOT]] 应用。

最后生成一个 EXE 并不困难，真正困难的是让 Debug 环境中正常工作的配置、HTTP 和 UI 初始化逻辑在裁剪后的原生程序里继续可靠运行。本文按实际排错顺序记录这次迁移，并把其中可复用的解决方式整理出来。

> 本文保留 ArturiaLink 的项目名和类型名。服务地址、凭据、本机路径及账户信息均已替换为示例值。

## ✦ 先分清四种发布概念（Distinguishing Four Publishing Concepts）

在 Rider 的发布配置中，可以同时看到自包含、[[ReadyToRun]]、修剪和单文件等选项。它们不是 [[NativeAOT]] 的不同名称。

| 选项 | 作用 | 是否等于 Native AOT |
| --- | --- | --- |
| Self-Contained | 把目标 .NET 运行时随应用一起发布 | 否 |
| ReadyToRun | 为部分程序集预生成本机代码，仍依赖 .NET 运行时 | 否 |
| PublishSingleFile | 尽量把托管发布文件打包为单文件 | 否 |
| PublishTrimmed | 删除分析认为不会使用的代码 | 否，但 Native AOT 会隐含启用 |
| PublishAot | 把应用编译为目标平台原生代码 | 是 |

ArturiaLink 的项目文件需要明确声明：

```xml
<PropertyGroup>
    <OutputType>WinExe</OutputType>
    <TargetFramework>net10.0</TargetFramework>
    <PublishAot>true</PublishAot>
</PropertyGroup>
```

Windows x64 的发布配置使用：

- 配置：`Release`
- 目标框架：`net10.0`
- 部署模式：自包含
- 目标运行时：`win-x64`
- 修剪未使用的程序集：启用
- ReadyToRun：不启用
- 产生单个文件：不作为 AOT 的必要条件

等价的命令行入口是：

```powershell
dotnet publish <repo>\src\client\ArturiaLink.Client\ArturiaLink.Client.csproj `
  -c Release `
  -r win-x64 `
  --self-contained true `
  -p:PublishAot=true
```

发布目录中除了 `ArturiaLink.Client.exe`，仍可能包含 PDB 和 [[Skia]]、[[HarfBuzz]] 等原生库。这不代表 AOT 失败，也不代表勾选"单文件"就能安全删除这些依赖。[[Avalonia]] 桌面程序依赖的原生图形库仍要随发布物分发。

## ✦ 第一个坑：AOT 强制裁剪，Rider 却把裁剪关了（Pitfall 1: AOT Forces Trimming, But Rider Disabled It）

第一次发布直接失败：

```text
PublishTrimmed is implied by native compilation and cannot be disabled.
```

### ✦ 现象（Symptoms）

项目已经设置 `PublishAot=true`，发布配置也选择了自包含和 `win-x64`，但 MSBuild 在进入原生编译前终止。

### ✦ 根因（Root Cause）

[[NativeAOT]] 必须分析并裁剪应用。ArturiaLink 当时的 Rider 发布配置没有勾选"修剪未使用的程序集"，该配置最终向 MSBuild 显式传入了 `PublishTrimmed=false`。

这和"不填写 `PublishTrimmed`"不同。前者是在覆盖 [[NativeAOT]] 的隐含要求，后者才允许 SDK 根据 `PublishAot` 自动决定。

### ✦ 错误做法（Wrong Approach）

看到 `<PublishAot>true</PublishAot>` 后，认为 Rider 中的裁剪选项可以保持关闭。对于这个发布配置，未勾选不是"交给 SDK 决定"，而是显式关闭。

### ✦ 修复（Fix）

在 Rider 中启用"修剪未使用的程序集"，保持 ReadyToRun 和单文件关闭，然后重新发布。

### ✦ 如何验证（Verification）

不要只看 Rider 的复选框。应检查最终日志中的 MSBuild 错误和属性冲突。如果仍出现上述错误，说明发布链路中还有其他位置写入了 `PublishTrimmed=false`，例如发布配置文件或额外 MSBuild 参数。

## ✦ 第二个坑：使用 Rider 也需要微软原生链接器（Pitfall 2: Rider Still Needs the Microsoft Native Linker）

裁剪冲突解决后，发布继续推进，但在原生链接阶段失败：

```text
Platform linker not found.
Ensure you have all the required prerequisites,
in particular the Desktop Development for C++ workload.
```

### ✦ 现象（Symptoms）

C# 项目和 [[Avalonia]] XAML 都已经编译成功，[[NativeAOT]] 编译器也开始工作，最后却提示找不到平台链接器。

### ✦ 根因（Root Cause）

Rider 是 IDE，不会替代 Windows 原生工具链。Windows [[NativeAOT]] 的完整链路是：

```text
Rider -> dotnet/MSBuild -> Native AOT compiler -> MSVC link.exe
```

.NET SDK 负责托管构建和 AOT 编译流程，最终生成 Windows 原生可执行文件时仍需要微软的 `link.exe`、目标库和 Windows SDK。

### ✦ 错误做法（Wrong Approach）

因为项目始终在 Rider 中开发，就认为不需要安装任何 Visual Studio 组件。实际上需要的是 Visual Studio Build Tools，而不是必须改用 Visual Studio IDE。

### ✦ 修复（Fix）

安装 Visual Studio Build Tools，并选择：

- 使用 C++ 的桌面开发
- [[MSVC]] x64/x86 生成工具
- Windows SDK

安装完成后重启 Rider，让新工具链进入 IDE 和 MSBuild 的环境发现范围。

### ✦ 如何验证（Verification）

如果错误发生在 `Microsoft.NETCore.Native.Windows.targets`，并明确写着 `Platform linker not found`，应先修复机器环境。修改业务代码、JSON 配置或 [[Avalonia]] 项目属性都不会生成缺失的 `link.exe`。

## ✦ 能生成 EXE，不代表程序已经兼容 AOT（Building an EXE Doesn't Mean AOT Compatibility）

安装链接器后，ArturiaLink 已经能够生成原生 EXE。但运行发布版时出现了两个 Debug 中不存在的症状：

1. 删除本地配置数据库后，Debug 版本会自动打开首次设置面板，AOT 版本却不会。
2. 进入需要 HTTP JSON 响应的功能时，日志出现运行时异常：

```text
Reflection-based serialization has been disabled for this application.
Either use the source generator APIs or explicitly configure
the JsonSerializerOptions.TypeInfoResolver property.
```

构建阶段其实已经给过提示：

```text
warning IL2026: JSON serialization and deserialization might require
types that cannot be statically analyzed.
```

这类问题说明 AOT 验收至少有三个层次：

1. C# 和 XAML 能编译。
2. [[NativeAOT]] 能生成目标平台程序。
3. 裁剪后的程序能完成真实用户流程。

只完成前两个层次，还不能宣布应用支持 AOT。

## ✦ JSON 坑：泛型封装隐藏了运行时反射（Pitfall 3: Generic Wrappers Hide Runtime Reflection）

ArturiaLink 把 HTTP 能力放在共享层 `Arturia.Core.Http` 中。原来的泛型方法看起来很自然：

```csharp
JsonContent.Create(request);

await response.Content
    .ReadFromJsonAsync<ApiResponse<TResponse>>(cancellationToken);
```

[[DPAPI]] 帮助类也先把泛型对象序列化成 JSON，再进行加密：

```csharp
byte[] jsonBytes = JsonSerializer.SerializeToUtf8Bytes(obj);
T? value = JsonSerializer.Deserialize<T>(jsonBytes);
```

### ✦ 为什么 Debug 正常（Why Debug Works）

普通 JIT 环境保留了更完整的程序集元数据。[[SystemTextJson]] 可以在运行时检查 `T` 的属性、构造函数和泛型结构，再建立序列化契约。

### ✦ 为什么 AOT 失败（Why AOT Fails）

[[NativeAOT]] 要在发布阶段确定需要生成和保留的代码。共享层只看到开放的 `TRequest`、`TResponse`，无法自动证明运行时到底会出现哪些闭合类型。

例如下面三个类型在运行时是三份不同的 JSON 契约：

```csharp
ApiResponse<object>
ApiResponse<string>
ApiResponse<LinkHistoryPageDto>
```

只知道存在 `ApiResponse<T>`，并不足以生成它们的原生序列化代码。

## ✦ 使用 JsonSerializerContext 提前生成元数据（Using JsonSerializerContext to Generate Metadata Ahead of Time）

解决方案是在客户端集中声明实际使用的 JSON 根类型：

```csharp
using System.Text.Json.Serialization;
using Arturia.Core.Responses;
using ArturiaLink.Client.Dtos;

namespace ArturiaLink.Client.Serialization;

[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(string))]
[JsonSerializable(typeof(CreateLinkRequestDto))]
[JsonSerializable(typeof(ApiResponse<object>))]
[JsonSerializable(typeof(ApiResponse<string>))]
[JsonSerializable(typeof(ApiResponse<LinkHistoryPageDto>))]
internal partial class ArturiaLinkJsonSerializerContext
    : JsonSerializerContext;
```

编译器会为这些具体类型生成 `JsonTypeInfo<T>`。运行时不再需要从零反射 DTO 结构。

### ✦ 需要登记哪些类型（Which Types to Register）

规则不是"每个属性都写一个 `JsonSerializable`"，而是登记直接进入序列化边界的根类型：

- 直接作为 JSON 请求体的 DTO。
- 直接从响应体读取的完整闭合类型。
- 直接交给 DPAPI JSON 层的类型。

登记 `ApiResponse<LinkHistoryPageDto>` 后，源生成器会继续分析分页 DTO、列表项 DTO、集合、字符串和时间属性。通常不需要把对象图中的每个成员类型再写一遍。

但是每个实际使用的泛型闭合组合仍要明确登记。开放泛型 `ApiResponse<>` 不能代替 `ApiResponse<string>` 和 `ApiResponse<LinkHistoryPageDto>`。

如果类型逐渐增多，可以把同一个 Context 拆成多个 `partial` 文件按模块维护，但不要为了少写几个特性而创建一个改变 JSON 结构的"大包装 DTO"。

## ✦ 让 JsonTypeInfo 贯穿共享 HTTP 层（Threading JsonTypeInfo Through the Shared HTTP Layer）

仅仅创建 [[JsonSerializerContext]] 还不够。如果共享层继续调用依赖反射的重载，源生成元数据不会自动出现在正确位置。

ArturiaLink 因此调整了共享接口，让调用方显式提供请求和响应类型信息：

```csharp
Task<Result<TResponse>> GetAsync<TResponse>(
    string relativePath,
    JsonTypeInfo<ApiResponse<TResponse>> responseTypeInfo,
    string? bearerToken = null,
    CancellationToken cancellationToken = default);

Task<Result<TResponse>> PostJsonAsync<TRequest, TResponse>(
    string relativePath,
    TRequest request,
    JsonTypeInfo<TRequest> requestTypeInfo,
    JsonTypeInfo<ApiResponse<TResponse>> responseTypeInfo,
    string? bearerToken = null,
    CancellationToken cancellationToken = default);
```

实现层改用接收 [[JsonTypeInfo]] 的重载：

```csharp
Content = JsonContent.Create(request, requestTypeInfo);

return await response.Content.ReadFromJsonAsync(
    responseTypeInfo,
    cancellationToken);
```

客户端调用时必须选择具体契约：

```csharp
await httpClient.PostJsonAsync<CreateLinkRequestDto, string>(
    "/api/v1/links",
    request,
    ArturiaLinkJsonSerializerContext.Default.CreateLinkRequestDto,
    ArturiaLinkJsonSerializerContext.Default.ApiResponseString,
    "<access-token>",
    cancellationToken);
```

这种设计比在 Core 内部静默创建一个反射型 `JsonSerializerOptions` 更啰嗦，但它有两个明显优势：

1. 类型元数据的所有权留在真正知道 DTO 的客户端。
2. 新增接口却忘记登记类型时，调用点会立即缺少所需的 [[JsonTypeInfo]]，问题更早暴露。

## ✦ DPAPI 的泛型 JSON 也要一起改（DPAPI's Generic JSON Also Needs Changes）

HTTP 并不是唯一的 JSON 边界。ArturiaLink 使用 [[DPAPI]] 保护本地 Access Token，帮助类内部同样使用了泛型 JSON。

修复后的方法要求调用方提供类型信息：

```csharp
public static Result<string> Encrypt<T>(
    T value,
    JsonTypeInfo<T> jsonTypeInfo,
    string? optionalEntropy = null,
    DataProtectionScope scope = DataProtectionScope.CurrentUser)
{
    byte[] jsonBytes = JsonSerializer.SerializeToUtf8Bytes(
        value,
        jsonTypeInfo);

    // 省略 DPAPI 调用
}
```

Token 调用使用：

```csharp
ArturiaLinkJsonSerializerContext.Default.String
```

字符串的源生成序列化结果仍然是标准 JSON 字符串，因此不会仅仅因为从反射重载切换到 [[JsonTypeInfo]]`<string>` 就改变已有密文解密前的 JSON 格式。

### ✦ 不要把 UI 状态带入 JSON 契约（Don't Mix UI State into JSON Contracts）

历史列表项为了消除 XAML 反射绑定，后来增加了一个 `ICommand` 属性。它属于展示状态，不属于服务端响应。对应属性必须排除：

```csharp
[JsonIgnore]
public bool IsLastest { get; set; }

[JsonIgnore]
public ICommand? CopyCommand { get; set; }
```

这样既避免源生成器把 UI 命令纳入 HTTP 契约，也防止将来序列化列表项时意外输出客户端状态。

## ✦ Avalonia 坑：字符串事件行为没有触发首次初始化（Pitfall 4: String-Based Event Behavior Didn't Trigger Initial Setup）

ArturiaLink 原来通过行为包监听窗口加载事件：

```xml
<Interaction.Behaviors>
    <EventTriggerBehavior EventName="Loaded">
        <InvokeCommandAction Command="{Binding WindowLoadedCommand}" />
        <InvokeCommandAction Command="{Binding GetHistoryLinksCommand}" />
    </EventTriggerBehavior>
</Interaction.Behaviors>
```

Debug 版本中，这段逻辑会读取 [[LiteDB]]；找不到配置时，将 `IsSettingsOpen` 设为 `true`。AOT 版本窗口本身正常显示，点击齿轮也能手动打开设置面板，但首次启动没有自动打开。

这组现象缩小了问题范围：

- [[LiteDB]] 能创建数据库。
- 设置面板和 `IsSettingsOpen` 绑定正常。
- 齿轮命令正常。
- 失败的是窗口加载到 ViewModel 初始化命令之间的路径。

`EventName="Loaded"` 使用字符串描述事件。这样的运行时发现路径比编译器直接可见的生命周期方法更容易受到裁剪影响。

### ✦ 修复：使用强类型窗口生命周期（Fix: Using Strongly-Typed Window Lifecycle）

窗口 code-behind 只负责把 [[Avalonia]] 生命周期转发给 ViewModel，不承载配置或 HTTP 业务：

```csharp
protected override void OnLoaded(RoutedEventArgs e)
{
    base.OnLoaded(e);

    if (DataContext is not MainWindowViewModel viewModel)
        return;

    viewModel.WindowLoadedCommand.Execute(null);
    viewModel.GetHistoryLinksCommand.Execute(null);
}
```

这仍然保持 [[MVVM]] 边界：

- code-behind 只处理窗口生命周期。
- 配置读取、设置状态和历史请求仍由 ViewModel 命令协调。
- 编译器可以直接看到 `MainWindowViewModel` 和两个命令，不再根据字符串寻找 `Loaded` 事件。

这里需要限定结论：这次修复证明的是 ArturiaLink 中这条字符串事件路径不适合当前 AOT 发布方式，不代表整个 `Xaml.Behaviors.Avalonia` 包都不支持 AOT。

## ✦ DataTemplate 中的 ReflectionBinding 也要处理（ReflectionBinding in DataTemplate Also Needs Fixing）

历史记录模板原来需要从列表项内部访问父级 ViewModel 的复制命令，因此使用了 [[ReflectionBinding]]：

```xml
CopyCommand="{ReflectionBinding
    #HistoryListBox.DataContext.CopyHistoryShortUrlCommand}"
```

项目已经默认启用 [[Avalonia]] 编译绑定，继续在局部显式使用 [[ReflectionBinding]] 会留下另一条运行时属性发现路径。

### ✦ 修复：让展示项直接持有命令引用（Fix: Let Display Items Hold Command References Directly）

创建历史展示项时，把同一个生成命令引用赋进去：

```csharp
LinkHistoryItemDtos.Add(new LinkHistoryItemDto
{
    Id = dto.Id,
    TargetUrl = dto.TargetUrl,
    ShortUrl = dto.ShortUrl,
    CreatedAt = dto.CreatedAt,
    CopyCommand = CopyHistoryShortUrlCommand
});
```

模板只需要普通编译绑定：

```xml
<ui:ArturiaHistoryItem
    CopyCommand="{Binding CopyCommand}"
    LongUrl="{Binding TargetUrl}"
    ShortUrl="{Binding ShortUrl}" />
```

所有列表项可以引用同一个命令对象，不需要为每项创建一套复制逻辑。

项目仍保留明确类型的 `ScrollChangedTrigger` 来触发分页加载。这类剩余行为必须通过发布版滚动烟测验证，而不是因为它来自行为包就一律删除或一律认定安全。

## ✦ LiteDB：AOT 发布成功后仍然存在的风险（LiteDB: Risks That Persist After AOT Publish Success）

项目自身的 JSON `IL2026` 消除后，AOT 发布仍然报告：

```text
warning IL2104: Assembly 'LiteDB' produced trim warnings.
warning IL3053: Assembly 'LiteDB' produced AOT analysis warnings.
```

展开汇总警告后，可以看到 [[LiteDB]] 的映射器会检查属性、字段、接口和构造函数，并使用表达式树及运行时泛型构造。代表性警告包括 `IL2070` 和 `IL3050`。

这些警告来自第三方库，不等于 ArturiaLink 当前使用的每个 [[LiteDB]] 操作都会失败；但同样不能因为 EXE 已经生成就直接忽略。这次配置"假成功"正是第三方映射路径在真实流程中暴露出的故障。

### ✦ 现象：文件存在，但数据库仍是空的（Symptom: File Exists, But Database Is Empty）

AOT 客户端保存配置后显示成功，重新打开设置却没有 Token，生成短链也继续提示先完成配置。数据库文件已经生成，而且大小约为 16KB，看起来不像写入失败。

只读检查给出了真正的失败基线：

```text
COLLECTION_COUNT=0
```

16KB 只是 [[LiteDB]] 创建空数据库后的基础文件大小，不代表已经创建集合或写入文档。此时数据库里连 `appconfigmodels` 集合都不存在。

### ✦ 根因：POCO 映射元数据被裁剪（Root Cause: POCO Mapping Metadata Was Trimmed）

[[JsonSerializerContext]] 只负责 [[SystemTextJson]]，不会参与 [[LiteDB]] 的 [[BSON]] 映射。[[LiteDB]] 的 [[BsonMapper]] 仍会在运行时检查 `AppConfigModel` 的公共属性和构造函数；如果共享泛型仓储没有向裁剪器声明这个要求，[[NativeAOT]] 可能移除映射所需元数据，最终导致实体没有被正常写入。

同时，项目还误解了当前 [[LiteDB]] `6.0.0-prerelease.77` 的返回值。它的单实体实现等价于：

```csharp
return Upsert(new[] { entity }) == 1;
```

因此 `true` 表示恰好写入一条文档，`false` 表示没有完成单条写入，并不表示"本次执行了插入而不是更新"。旧逻辑把 `false` 当作插入成功，随后无条件显示成功 Toast，于是形成了完整的假成功链路：映射元数据被裁剪，`Upsert` 零写入并返回 `false`，客户端却把它解释为插入成功。

### ✦ 尝试过的缓解：声明裁剪契约（Attempted Mitigation: Declaring Trimming Contracts）

AOT 探索阶段曾在共享仓储接口和实现的 `TEntity` 上声明 [[LiteDB]] 映射需要保留的成员：

```csharp
public interface IRepository<
    [DynamicallyAccessedMembers(
        DynamicallyAccessedMemberTypes.PublicProperties |
        DynamicallyAccessedMemberTypes.PublicConstructors)]
    TEntity>
    where TEntity : class, IEntity<Guid>
{
    // ...
}
```

`LiteDbRepository<TEntity>` 当时也使用了相同注解。这样可以让裁剪要求沿泛型仓储边界传递，保留当前 [[POCO]] 映射所需的公共属性和公共构造函数。

但这只能保护已知模型成员，不能消除 [[LiteDB]] 自身的反射、表达式树和动态泛型风险，也不能让第三方 `IL2104/IL3053` 汇总警告消失。项目最终取消 [[NativeAOT]] 作为 v1.0 默认发布方式，因此当前仓储已撤回这组裁剪注解。

### ✦ 保留的修复：写后读回（Retained Fix: Write-then-Read-Back Verification）

`Upsert` 返回值的误判与发布方式无关，因此保存流程的正确性修复继续保留。[[DPAPI]] 加密完成后，客户端要求 `Upsert` 返回 `true`，再按固定配置 ID 读回文档，并以序号比较确认 ID 与刚写入的密文一致。任一步失败都返回失败并保持设置面板打开；只有写入和读回验证都成功，才显示"配置已保存"。

ArturiaLink 当前只用 [[LiteDB]] 保存很小的本地配置模型。最低限度仍要验证：

1. 配置目录不存在时能够创建数据库。
2. 空库能够判断为未配置。
3. Token 加密后能够写入。
4. 关闭应用后数据库能够正常释放。
5. 再次启动能够映射配置模型并解密 Token。
6. 配置损坏或解密失败时仍能进入错误处理分支。

在 AOT 探索中，只有这些实际使用路径通过，才能说明当前 [[LiteDB]] 用法在目标 AOT 发布物中可用。更宽泛的 [[LiteDB]] CRUD、表达式查询和复杂映射仍不能据此获得 AOT 兼容保证。

## ✦ 一套可重复的验证清单（A Repeatable Verification Checklist）

### ✦ 确认 SDK 和工具链（Verify SDK and Toolchain）

```powershell
dotnet --info
```

确认命令行使用的 SDK 与 Rider 发布配置一致。机器同时安装稳定版和预览版 SDK 时，没有 `global.json` 的仓库可能自动选择更新的预览版，因此不能只凭目标框架判断实际构建 SDK。

### ✦ 构建解决方案（Build the Solution）

```powershell
dotnet build <repo>\Arturia.ShortLink.sln -c Release
```

解决普通编译和 XAML 编译问题后，再进入 AOT 发布。不要用 AOT 的长日志掩盖基础编译错误。

### ✦ 发布 win-x64 AOT（Publish win-x64 AOT）

```powershell
dotnet publish <repo>\src\client\ArturiaLink.Client\ArturiaLink.Client.csproj `
  -c Release `
  -r win-x64 `
  --self-contained true `
  -p:PublishAot=true `
  -o <publish-dir>
```

重点搜索：

- `IL2026`
- `IL3050`
- `IL2104`
- `IL3053`
- `Platform linker not found`
- `Reflection-based serialization`

警告应分类处理，不能只统计数量。项目自身可修复的反射路径和第三方库汇总警告不是同一种风险。

### ✦ 验证首次配置（Verify First-Time Setup）

关闭所有 Debug 和已发布客户端，避免它们共同占用 [[LiteDB]]。备份：

```text
%LOCALAPPDATA%\ArturiaLink\lite.db
```

将数据库暂时移走，再启动 `<publish-dir>\ArturiaLink.Client.exe`，确认：

- 设置面板自动打开。
- 未配置时不能直接取消。
- 不会读取发布目录或工作目录中的旧数据库。

### ✦ 验证保存和重启（Verify Save and Restart）

在测试环境中使用测试凭据完成验证；项目预设的服务端地址在文章和截图中统一记作 `https://api.example.com`，不保留真实域名或 Token。

确认：

- 健康检查成功。
- Token 能通过 [[DPAPI]] 加密并写入 [[LiteDB]]。
- 关闭后重启不会再次强制打开设置。
- Token 可以解密。

### ✦ 验证核心工作流（Verify Core Workflow）

- 创建短链请求能够正确序列化。
- `ApiResponse<string>` 能够反序列化。
- 历史分页响应能够反序列化。
- 滚动分页行为继续触发。
- 点击历史短链能够复制。
- 日志中不再出现反射 JSON 被禁用的异常。

验证完成后恢复原数据库，避免测试配置覆盖日常开发状态。

## ✦ 最终决策：v1.0 使用普通 Self-Contained（Final Decision: v1.0 Uses Plain Self-Contained）

这次迁移最重要的经验不是某一个 MSBuild 属性，而是改变验收方式。

[[NativeAOT]] 同时约束：

- 构建机原生工具链。
- 发布属性之间的组合。
- JSON、绑定和事件等运行时反射路径。
- 第三方依赖的裁剪与动态代码行为。
- 应用真实启动、存储和网络流程。

对 ArturiaLink 来说，项目自身可控的部分采用了三个明确策略：

1. JSON 使用源生成 [[JsonSerializerContext]]，并让 [[JsonTypeInfo]] 穿过泛型共享层。
2. 窗口初始化使用强类型生命周期方法，不再依赖字符串事件名。
3. DataTemplate 使用编译绑定，不再依赖 [[ReflectionBinding]] 查找父级命令。

这些改造不只服务 AOT，也减少了隐式反射路径，并让序列化元数据和 UI 生命周期更明确，因此在取消 AOT 后继续保留。

[[LiteDB]] 仍然产生无法由项目代码彻底消除的第三方 AOT 分析警告。继续为当前依赖组合维护裁剪契约和 AOT 专属烟测，成本已经超过启动性能收益。因此 ArturiaLink v1.0 最终采用 `Release + win-x64 + Self-Contained` 普通发布，不默认启用 [[NativeAOT]]，也不默认启用 [[ReadyToRun]]。

这不否定本次探索：它证明了"能生成原生 EXE"与"真实业务流程可靠"之间仍有距离。[[NativeAOT]] 作为技术实验保留在本文中；未来只有在 [[LiteDB]] 或存储方案具备更明确的 AOT 支持，并完成配置持久化与核心流程验证后，才重新评估正式启用。
