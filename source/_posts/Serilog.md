---
title: 'Serilog: 从桌面应用日志到结构化诊断'
cover: /img/bg/serilog-cover.webp
abbrlink: k7m2x9qa
date: 2026-05-15 00:02:50
categories:
  - .NET
tags:
  - Serilog
  - Avalonia
  - 日志
  - .NET
glossary:
  Serilog:
    title: Serilog
    brief: .NET 生态里常用的结构化日志库，把日志从字符串提升为可查询、可过滤、可路由的事件流。
  StructuredLogging:
    title: 结构化日志
    brief: 不只写一行文本，而是把日志消息和属性一起记录，方便后续检索、过滤和分析。
  Sink:
    title: Sink
    brief: Serilog 的日志输出目标，比如控制台、文件、Seq、数据库或 Trace。
  LoggerConfiguration:
    title: LoggerConfiguration
    brief: Serilog 的日志管线构建器，负责设置级别、输出目标、过滤器和增强属性。
  MinimumLevel:
    title: MinimumLevel
    brief: 日志最低输出级别，用来决定哪些事件会进入日志管线。
  SourceContext:
    title: SourceContext
    brief: Microsoft.Extensions.Logging 注入 ILogger<T> 时自动带上的类型上下文，常用于识别日志来源类。
  OutputTemplate:
    title: OutputTemplate
    brief: 文本日志的输出格式模板，用来控制时间、级别、来源、消息、异常等字段如何显示。
  Properties:
    title: Properties
    brief: Serilog 输出模板里的额外属性占位符，显示没有被消息正文消费掉的结构化属性。
  MessageTemplate:
    title: MessageTemplate
    brief: Serilog 的消息模板语法，例如 {Count} 会被记录为结构化属性，而不是普通字符串插值。
  Enrich:
    title: Enrich
    brief: 为每条日志事件附加额外上下文属性的机制，比如机器名、线程 ID、TraceId。
  Filter:
    title: Filter
    brief: Serilog 中用于包含或排除日志事件的规则，常用于按级别或属性分流日志。
  SubLogger:
    title: SubLogger
    brief: Serilog 子日志管线，用 Logger(...) 包住一组过滤器和 Sink，避免过滤器作用范围错误。
  RollingFile:
    title: Rolling File
    brief: 按时间或大小滚动生成日志文件的文件日志策略，适合桌面应用和服务端应用留存历史日志。
  UTF8:
    title: UTF-8
    brief: 跨平台通用字符编码，中文日志输出到控制台时通常需要显式指定，避免 Windows 代码页乱码。
  Fatal:
    title: Fatal
    brief: Serilog 的最高日志级别，表示应用级不可恢复错误或即将终止的故障。
  MicrosoftExtensionsLogging:
    title: Microsoft.Extensions.Logging
    brief: .NET 官方日志抽象层，业务代码依赖 ILogger<T>，具体日志实现可以由 Serilog 接管。
---

> 写作说明：本文基于笔者在 `Arturia.ShortLink` 项目中接入 Serilog 的实际经历整理而成，部分结构和表达由 AI 辅助梳理。文中的判断、取舍和案例均来自实际调试过程，AI 只参与归纳、重组和文字润色。

## ✦ 为什么桌面应用也需要认真做日志（Why Logging Matters）

很多人第一次给桌面应用接日志，通常只是为了“出错时看一眼”。但真正踩过几次坑以后，就会发现日志不是附属品，而是应用的黑匣子。

在我这个 `Arturia.ShortLink` 项目里，日志承担了几个非常具体的职责：

- 应用启动是否成功。
- 导航配置是否加载。
- `Config.Json` 是否存在、是否格式正确。
- 页面导航是否命中路由。
- 遇到不可恢复错误时，是否能留下现场。
- 控制台和文件里的日志是否可读、可追踪。

这类场景非常适合使用 [[Serilog]]。它不是简单地把字符串写到控制台，而是围绕 [[StructuredLogging]] 构建了一整套日志事件模型：日志有级别、有消息模板、有属性、有异常、有输出目标，还能按规则过滤和分流。

换句话说，Serilog 不是“打印文本”的工具，而是一条日志事件流水线。

## ✦ Serilog 的核心模型（Core Model）

Serilog 的底层逻辑可以拆成五个部分：

```text
日志事件 -> 最低级别判断 -> Enrich 增强 -> Filter 过滤 -> Sink 输出
```

对应到代码，通常就是：

```csharp
Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Debug()
    .Enrich.FromLogContext()
    .WriteTo.Console()
    .WriteTo.File("logs/app.log")
    .CreateLogger();
```

这里面几个关键概念必须先搞清楚。

## ✦ LoggerConfiguration：日志管线的起点（Logger Configuration）

[[LoggerConfiguration]] 是 Serilog 的配置入口。它不是日志对象本身，而是用来构建日志对象的 Builder。

典型写法：

```csharp
Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Debug()
    .WriteTo.Console()
    .WriteTo.File("logs/app.log")
    .CreateLogger();
```

最后的 `CreateLogger()` 才会真正创建全局日志器。

在你的项目里，入口配置位于 `Program.cs`：

```csharp
Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Debug()
    .MinimumLevel.Override("Microsoft", LogEventLevel.Warning)
    .MinimumLevel.Override("System", LogEventLevel.Warning)
    .MinimumLevel.Override("Avalonia", LogEventLevel.Warning)
#if DEBUG
    .WriteTo.Async(r => r.Console())
#endif
    .WriteTo.Async(r => r.File("logs/app/app.log",
        rollingInterval: RollingInterval.Day,
        retainedFileCountLimit: 7,
        outputTemplate: "{Timestamp:yyyy-MM-dd HH:mm:ss.fff zzz} [{Level:u3}] [{SourceContext}] {Message:lj} {Properties}{NewLine}{Exception}")
        .Filter.ByIncludingOnly(e => e.Level is >= LogEventLevel.Warning and <= LogEventLevel.Error))
    .WriteTo.Async(r => r.File("logs/fatal/app.log",
            rollingInterval: RollingInterval.Day,
            retainedFileCountLimit: 7,
            outputTemplate: "{Timestamp:yyyy-MM-dd HH:mm:ss.fff zzz} [{Level:u3}] [{SourceContext}] {Message:lj} {Properties}{NewLine}{Exception}")
        .Filter.ByIncludingOnly(e => e.Level >= LogEventLevel.Fatal))
    .CreateLogger();
```

这段配置已经覆盖了 Serilog 的几个关键 API：日志级别、命名空间覆盖、控制台输出、文件输出、异步写入、输出模板、过滤器。

但里面也正好藏着几个很典型的坑，后面会展开。

## ✦ MinimumLevel：日志级别不是越低越好（Minimum Level）

[[MinimumLevel]] 决定哪些日志事件可以进入 Serilog 管线。

Serilog 常见级别从低到高是：

```text
Verbose < Debug < Information < Warning < Error < Fatal
```

对应 API：

```csharp
.MinimumLevel.Verbose()
.MinimumLevel.Debug()
.MinimumLevel.Information()
.MinimumLevel.Warning()
.MinimumLevel.Error()
.MinimumLevel.Fatal()
```

你的项目使用了：

```csharp
.MinimumLevel.Debug()
```

意思是：Debug 及以上级别都会进入日志管线。

也就是说，下面这些都会进入：

```text
Debug
Information
Warning
Error
Fatal
```

但 Verbose 不会进入。

你还使用了：

```csharp
.MinimumLevel.Override("Microsoft", LogEventLevel.Warning)
.MinimumLevel.Override("System", LogEventLevel.Warning)
.MinimumLevel.Override("Avalonia", LogEventLevel.Warning)
```

这非常合理。桌面应用接入框架后，经常会有大量 Microsoft、System、Avalonia 的内部日志。如果不压级别，控制台和文件会被框架噪声淹没。

这几行的意思是：默认 Debug 起步，但 Microsoft/System/Avalonia 这些来源只保留 Warning 及以上。

这是工程里很常见的做法。

## ✦ LogEventLevel：什么时候用 Fatal（Log Levels）

Serilog 的日志级别由 `LogEventLevel` 表示：

```csharp
LogEventLevel.Verbose
LogEventLevel.Debug
LogEventLevel.Information
LogEventLevel.Warning
LogEventLevel.Error
LogEventLevel.Fatal
```

在项目中，我们讨论过一个重点：配置文件加载失败是否应该用 Critical/Fatal。

你的判断是合理的：如果 `Config.Json` 加载不成功会导致应用关闭退出，那它不是普通业务错误，而是应用级不可恢复错误。

在 Microsoft.Extensions.Logging 里叫：

```csharp
logger.LogCritical(...)
```

映射到 Serilog 里就是 [[Fatal]] 级别。

所以这种场景可以用：

```csharp
logger.LogCritical(exception, "致命错误：{Title} - {Message}", title, message);
```

它代表的不是“这段代码异常严重”，而是“这个应用当前已经无法继续运行”。

这点很关键。日志级别不应该只看异常类型，还要看业务后果。

## ✦ Microsoft.Extensions.Logging：业务代码不直接依赖 Serilog（Logging Abstraction）

你的 ViewModel 里不是直接写：

```csharp
Log.Information("...");
```

而是通过构造函数注入：

```csharp
public partial class MainWindowViewModel(
    INavigationService navigationService,
    IServiceProvider serviceProvider,
    ILogger<MainWindowViewModel> logger) : ViewModelBase
```

这里的 `ILogger<MainWindowViewModel>` 来自 [[MicrosoftExtensionsLogging]]。

这样做有几个好处：

- ViewModel 不直接绑定 Serilog。
- 日志来源类会自动变成 [[SourceContext]]。
- 测试和替换日志实现更容易。
- 符合 .NET 通用依赖注入模式。

在服务注册里，你用了：

```csharp
collection.AddLogging(logging =>
{
    logging.AddSerilog(dispose: true);
});
```

这行的作用是把 Serilog 接到 .NET 官方日志抽象层上。

也就是说，业务代码调用：

```csharp
logger.LogInformation("开始加载导航配置");
```

最后会进入 Serilog 配置的输出管线。

这是推荐架构：业务层依赖 `ILogger<T>`，基础设施层决定用 Serilog、NLog、Console Logger，或者别的日志实现。

## ✦ SourceContext：日志来自哪里（Source Context）

你在 [[OutputTemplate]] 里写了：

```text
[{SourceContext}]
```

所以日志里会出现：

```text
[Arturia.ShortLink.ViewModels.MainWindowViewModel]
```

这个 SourceContext 通常来自 `ILogger<T>` 里的泛型参数。

例如：

```csharp
ILogger<MainWindowViewModel>
```

就会产生：

```text
SourceContext = Arturia.ShortLink.ViewModels.MainWindowViewModel
```

这对排查问题非常有用。尤其是桌面应用里，很多日志来自启动、窗口、ViewModel、Service、导航层。如果没有 SourceContext，你只能看到“导航失败”，但不知道是谁写出来的。

推荐保留：

```text
[{SourceContext}]
```

如果嫌完整命名空间太长，可以后续用自定义 formatter 或日志查看工具处理，但在文件日志里完整保留更利于诊断。

## ✦ MessageTemplate：不要把 Serilog 当字符串插值（Message Template）

Serilog 最值得认真理解的是 [[MessageTemplate]]。

你应该这样写：

```csharp
logger.LogInformation("导航栏配置加载成功，共 {Count} 项", NavItems.Count);
```

而不是这样写：

```csharp
logger.LogInformation($"导航栏配置加载成功，共 {NavItems.Count} 项");
```

这两者输出看起来都差不多，但底层完全不同。

第一种会产生结构化属性：

```text
Count = 4
```

第二种只是一段普通字符串：

```text
导航栏配置加载成功，共 4 项
```

如果将来日志进入 Seq、ElasticSearch、数据库或者 JSON 文件，第一种可以按 Count 查询、过滤、统计。第二种只能全文搜索。

所以 Serilog 的正确写法是：

```csharp
logger.LogInformation("用户 {UserId} 打开页面 {PageName}", userId, pageName);
```

而不是：

```csharp
logger.LogInformation($"用户 {userId} 打开页面 {pageName}");
```

这也是结构化日志和普通文本日志的分界线。

## ✦ OutputTemplate：文本日志长什么样（Output Template）

你当前文件日志模板类似这样：

```csharp
outputTemplate:
"{Timestamp:yyyy-MM-dd HH:mm:ss.fff zzz} [{Level:u3}] [{SourceContext}] {Message:lj} {Properties}{NewLine}{Exception}"
```

这就是 [[OutputTemplate]]。

几个常用占位符含义如下：

```text
{Timestamp}     日志时间
{Level}         日志级别
{Message}       渲染后的消息
{Exception}     异常堆栈
{Properties}    额外结构化属性
{SourceContext} 日志来源上下文
{NewLine}       换行
```

你的模板里：

```text
{Timestamp:yyyy-MM-dd HH:mm:ss.fff zzz}
```

表示输出精确到毫秒，并带时区：

```text
2026-05-14 22:47:42.677 +08:00
```

这里：

```text
[{Level:u3}]
```

会把级别缩写成三位大写：

```text
[INF]
[DBG]
[WRN]
[ERR]
[FTL]
```

这里：

```text
{Message:lj}
```

表示输出消息正文，并使用 literal JSON 风格处理部分文本。普通文本日志里保留它即可。

问题出在：

```text
{Properties}
```

## ✦ Properties：为什么每行后面都有 { }（Properties Pitfall）

你看到日志每行后面都有：

```text
{  }
```

原因就是模板里的 [[Properties]]。

例如日志代码是：

```csharp
logger.LogInformation("导航栏配置加载成功，共 {Count} 项", NavItems.Count);
```

`Count` 会进入结构化属性。

但因为 `{Count}` 已经被 `{Message:lj}` 用来渲染正文了：

```text
导航栏配置加载成功，共 4 项
```

所以它不再属于“额外属性”。

这时候 `{Properties}` 没有东西可输出，就会显示一个空对象：

```text
{  }
```

于是你看到：

```text
2026-05-14 22:47:42.677 +08:00 [INF] [Arturia.ShortLink.ViewModels.MainWindowViewModel] 导航栏配置加载成功，共 4 项 {  }
```

这不是乱码，也不是错误，而是模板要求 Serilog 输出额外属性。

如果你没有大量使用 `LogContext.PushProperty(...)` 或 `Enrich.WithProperty(...)`，建议删掉 `{Properties}`：

```csharp
outputTemplate:
"{Timestamp:yyyy-MM-dd HH:mm:ss.fff zzz} [{Level:u3}] [{SourceContext}] {Message:lj}{NewLine}{Exception}"
```

删除之后日志会变成：

```text
2026-05-14 22:47:42.677 +08:00 [INF] [Arturia.ShortLink.ViewModels.MainWindowViewModel] 导航栏配置加载成功，共 4 项
```

更干净。

删除的影响是：那些没有写进正文模板的额外属性不会显示在文本日志里。

例如：

```csharp
using (LogContext.PushProperty("TraceId", traceId))
{
    logger.LogInformation("加载配置完成");
}
```

如果保留 `{Properties}`，可能看到：

```text
加载配置完成 { TraceId: "abc123" }
```

如果删除 `{Properties}`，TraceId 不会显示。

对你的当前项目来说，删除 `{Properties}` 基本是合理的，因为你还没有依赖上下文属性做诊断链路。

## ✦ Sink：日志输出到哪里（Sinks）

[[Sink]] 是 Serilog 的输出目标。

常见 Sink：

```csharp
.WriteTo.Console()
.WriteTo.File("logs/app.log")
.WriteTo.Debug()
.WriteTo.Trace()
.WriteTo.Seq("http://localhost:5341")
```

你项目里主要用了两个：

```csharp
.WriteTo.Async(r => r.Console())
.WriteTo.Async(r => r.File(...))
```

Console 用于开发阶段直接看输出。

File 用于保留历史日志，方便用户机器上回溯问题。

Async 是异步包装器，来自 Serilog.Sinks.Async。它会把日志写入操作放到后台队列里，减少业务线程被 I/O 阻塞的概率。

桌面应用里这很实用。尤其是 UI 线程敏感，不希望每条日志都同步写文件。

## ✦ File Sink：滚动文件和保留策略（File Sink）

你的文件配置里用了：

```csharp
.WriteTo.File("logs/app/app.log",
    rollingInterval: RollingInterval.Day,
    retainedFileCountLimit: 7,
    outputTemplate: "...")
```

这属于 [[RollingFile]] 策略。

关键参数：

```csharp
rollingInterval: RollingInterval.Day
```

表示按天滚动文件。

虽然配置路径写的是：

```text
logs/app/app.log
```

实际文件可能生成：

```text
logs/app/app20260514.log
```

这是 Serilog File Sink 的滚动命名行为。

这个参数：

```csharp
retainedFileCountLimit: 7
```

表示最多保留 7 个滚动日志文件。超过后旧文件会被清理。

这对桌面应用很重要。否则日志会随着使用时间无限增长，占用用户磁盘。

常见 File Sink 参数还包括：

```text
fileSizeLimitBytes
rollOnFileSizeLimit
shared
flushToDiskInterval
restrictedToMinimumLevel
encoding
```

例如：

```csharp
.WriteTo.File("logs/app.log",
    rollingInterval: RollingInterval.Day,
    retainedFileCountLimit: 7,
    fileSizeLimitBytes: 10 * 1024 * 1024,
    rollOnFileSizeLimit: true)
```

这表示既按天滚动，也按 10MB 大小滚动。

## ✦ Filter：为什么你的文件过滤没有生效（Filter Pitfall）

你原本想做两类文件：

```text
logs/app     记录 Warning 到 Error
logs/fatal   记录 Fatal
```

于是写了：

```csharp
.WriteTo.Async(r => r.File("logs/app/app.log",
    rollingInterval: RollingInterval.Day,
    retainedFileCountLimit: 7,
    outputTemplate: "...")
    .Filter.ByIncludingOnly(e => e.Level is >= LogEventLevel.Warning and <= LogEventLevel.Error))
```

这段代码看起来像是：先 File，再给这个 File 加 Filter。

但实际不是。

问题在于 `r.File(...)` 已经把 File Sink 注册到了当前管线。后面接的：

```csharp
.Filter.ByIncludingOnly(...)
```

并没有把前面的 File 包起来。

所以过滤器没有按你预期作用到这个文件输出上。

这也是为什么你的 `app.log` 和 `fatal.log` 里出现了：

```text
[INF] 应用程序启动
[INF] 开始加载导航配置
[DBG] 导航到：ConverterViewModel
```

如果过滤器真的只允许 Warning 到 Error，这些 INF 和 DBG 不应该进入文件。

正确做法是使用 [[SubLogger]]，先建立一个子日志管线，在子管线里面 Filter，再 WriteTo.File：

```csharp
.WriteTo.Async(r => r.Logger(lc => lc
    .Filter.ByIncludingOnly(e => e.Level is >= LogEventLevel.Warning and <= LogEventLevel.Error)
    .WriteTo.File("logs/app/app.log",
        rollingInterval: RollingInterval.Day,
        retainedFileCountLimit: 7,
        outputTemplate: "{Timestamp:yyyy-MM-dd HH:mm:ss.fff zzz} [{Level:u3}] [{SourceContext}] {Message:lj}{NewLine}{Exception}")))
```

Fatal 文件同理：

```csharp
.WriteTo.Async(r => r.Logger(lc => lc
    .Filter.ByIncludingOnly(e => e.Level >= LogEventLevel.Fatal)
    .WriteTo.File("logs/fatal/app.log",
        rollingInterval: RollingInterval.Day,
        retainedFileCountLimit: 7,
        outputTemplate: "{Timestamp:yyyy-MM-dd HH:mm:ss.fff zzz} [{Level:u3}] [{SourceContext}] {Message:lj}{NewLine}{Exception}")))
```

这样结构就是：

```text
Async
  -> SubLogger
       -> Filter
       -> File
```

过滤器明确包住了 File Sink，日志分流才会生效。

## ✦ WriteTo.Async：异步写日志不是银弹（Async Sink）

你用了：

```csharp
.WriteTo.Async(r => r.Console())
.WriteTo.Async(r => r.File(...))
```

这个 API 的意义是：让具体 Sink 在后台异步写入。

优点：

- 减少文件 I/O 阻塞。
- 降低 UI 线程卡顿概率。
- 日志量较大时更平滑。

但它也有注意点：程序退出前必须 flush。

你在 finally 里写了：

```csharp
Log.CloseAndFlush();
```

这是正确的。它会尽量把缓冲中的日志写完。

如果没有这行，应用崩溃或退出时，异步队列里可能还有日志没落盘。

这对 Fatal 日志尤其关键。最重要的错误现场，往往发生在程序结束前一刻。

## ✦ Console 乱码：Windows 下中文日志的编码坑（Console Encoding）

你遇到的另一个坑是控制台中文乱码。

原因通常不是 Serilog 写错了，而是 Windows 控制台的默认编码和程序输出编码不一致。

解决方式是在 Serilog Console Sink 初始化前设置 [[UTF8]]：

```csharp
using System.Text;

Console.OutputEncoding = Encoding.UTF8;
```

完整位置应该在：

```csharp
public static void Main(string[] args)
{
    Console.OutputEncoding = Encoding.UTF8;

    Log.Logger = new LoggerConfiguration()
        ...
        .CreateLogger();
}
```

为什么必须放在 Serilog 初始化前？

因为 Console Sink 初始化后会使用当前控制台输出编码。你越早设置，越不容易遇到环境差异。

如果你使用传统 `cmd.exe`，有时还需要：

```bash
chcp 65001
```

如果用 Windows Terminal、PowerShell 7、Rider 或 Visual Studio 新终端，通常代码里设置 `Console.OutputEncoding = Encoding.UTF8` 就够了。

## ✦ 程序入口的推荐写法（Program Setup）

结合你的项目，`Program.cs` 可以整理成下面这种结构：

```csharp
using Avalonia;
using System;
using System.Text;
using Serilog;
using Serilog.Events;

namespace Arturia.ShortLink;

sealed class Program
{
    [STAThread]
    public static void Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;

        Log.Logger = new LoggerConfiguration()
            .MinimumLevel.Debug()
            .MinimumLevel.Override("Microsoft", LogEventLevel.Warning)
            .MinimumLevel.Override("System", LogEventLevel.Warning)
            .MinimumLevel.Override("Avalonia", LogEventLevel.Warning)
#if DEBUG
            .WriteTo.Async(r => r.Console())
#endif
            .WriteTo.Async(r => r.Logger(lc => lc
                .Filter.ByIncludingOnly(e => e.Level is >= LogEventLevel.Warning and <= LogEventLevel.Error)
                .WriteTo.File("logs/app/app.log",
                    rollingInterval: RollingInterval.Day,
                    retainedFileCountLimit: 7,
                    outputTemplate: "{Timestamp:yyyy-MM-dd HH:mm:ss.fff zzz} [{Level:u3}] [{SourceContext}] {Message:lj}{NewLine}{Exception}")))
            .WriteTo.Async(r => r.Logger(lc => lc
                .Filter.ByIncludingOnly(e => e.Level >= LogEventLevel.Fatal)
                .WriteTo.File("logs/fatal/app.log",
                    rollingInterval: RollingInterval.Day,
                    retainedFileCountLimit: 7,
                    outputTemplate: "{Timestamp:yyyy-MM-dd HH:mm:ss.fff zzz} [{Level:u3}] [{SourceContext}] {Message:lj}{NewLine}{Exception}")))
            .CreateLogger();

        try
        {
            Log.Information("应用程序启动");
            BuildAvaloniaApp().StartWithClassicDesktopLifetime(args);
        }
        catch (Exception ex)
        {
            Log.Fatal(ex, "应用程序启动失败");
            throw;
        }
        finally
        {
            Log.CloseAndFlush();
        }
    }

    public static AppBuilder BuildAvaloniaApp()
        => AppBuilder.Configure<App>()
            .UsePlatformDetect()
            .WithInterFont()
            .LogToTrace();
}
```

这版解决了三个问题：

- 控制台中文乱码。
- 文件日志末尾 `{  }`。
- 文件 Sink 过滤器没有按预期生效。

## ✦ ViewModel 中的日志实践（ViewModel Logging）

在 `MainWindowViewModel` 里，日志不应该到处散落，而应该围绕关键状态转移记录。

例如加载导航配置：

```csharp
logger.LogInformation("开始加载导航配置");
```

成功时：

```csharp
logger.LogInformation("导航栏配置加载成功，共 {Count} 项", NavItems.Count);
```

导航时：

```csharp
logger.LogDebug("导航到：{ViewModelType}", viewModelType);
```

这些都是合理的。

真正需要注意的是异常日志不要重复记录。

之前的代码里可能出现这种结构：

```csharp
catch (JsonException jsonException)
{
    logger.LogCritical(jsonException, "配置文件 JSON 格式错误");
    ShowFatalError("配置文件格式错误", $"Config.Json 不是有效的 Json 格式。\n\n{jsonException.Message}");
}
```

然后 `ShowFatalError` 内部又写：

```csharp
logger.LogCritical("致命错误：{Title} - {Message}", title, message);
```

这样一次错误会记录两条 Critical 日志。

更好的做法是让 `ShowFatalError` 统一负责致命日志：

```csharp
private void ShowFatalError(string title, string message, Exception? exception = null)
{
    if (exception is null)
    {
        logger.LogCritical("致命错误：{Title} - {Message}", title, message);
    }
    else
    {
        logger.LogCritical(exception, "致命错误：{Title} - {Message}", title, message);
    }

    FatalErrorTitle = title;
    FatalErrorMessage = message;
    IsFatalErrorOpen = true;
}
```

然后 catch 中只调用：

```csharp
catch (JsonException jsonException)
{
    ShowFatalError("配置文件格式错误", $"Config.Json 不是有效的 Json 格式。\n\n{jsonException.Message}", jsonException);
}
```

这样一条错误只落一条日志，而且带异常堆栈。

## ✦ 取消操作不一定是 Warning（Cancellation）

你原本有：

```csharp
catch (OperationCanceledException)
{
    logger.LogWarning("用户取消了导航栏数据加载");
}
```

这类日志是否应该是 Warning，要看语义。

如果是用户主动取消，或者命令生命周期正常取消，它不是异常，不应该污染 Warning 日志。

更合理的是：

```csharp
logger.LogInformation("导航栏数据加载已取消");
```

或者如果只是开发调试信息：

```csharp
logger.LogDebug("导航栏数据加载已取消");
```

日志级别不是按“有没有异常类型”决定的，而是按“这件事是否代表系统异常状态”决定的。

## ✦ 路由未找到：Warning 还是 Critical（Route Not Found）

你的导航逻辑里有：

```csharp
catch (RouteNotFoundException routeNotFoundException)
{
    logger.LogWarning(routeNotFoundException, "路由未找到: {RouteKey}", routeNotFoundException.RouteKey);

    ViewNotFoundViewModel errorView = serviceProvider.GetRequiredService<ViewNotFoundViewModel>();
    errorView.ViewName = $"未找到视图：{routeNotFoundException.RouteKey.Replace("ViewModel","View")}";
    CurrentView = errorView;
}
```

这里用 Warning 是合理的。

原因是：路由未找到虽然是异常情况，但应用没有退出，而是降级显示了 `ViewNotFoundViewModel`。

这和配置文件加载失败不同。

配置文件失败会导致应用无法继续运行，所以可以 Critical。

路由未找到被 UI 兜底，所以是 Warning。

这就是日志级别设计的核心：看后果，而不是看情绪。

## ✦ Log.Fatal 与 logger.LogCritical 的关系（Fatal vs Critical）

在 Serilog 原生 API 里，最高级别是：

```csharp
Log.Fatal(...)
```

在 .NET `ILogger<T>` 抽象里，最高级别是：

```csharp
logger.LogCritical(...)
```

它们语义基本对应。

你在 `Program.cs` 里用：

```csharp
Log.Fatal(ex, "应用程序启动失败");
```

这是 Serilog 静态 API。

你在 ViewModel 里用：

```csharp
logger.LogCritical(exception, "致命错误：{Title} - {Message}", title, message);
```

这是 Microsoft 日志抽象 API。

二者最终都进入 Serilog 管线。

推荐原则：

- 程序入口、Host 启动前，可以用 `Log.Information`、`Log.Fatal`。
- 业务类、ViewModel、Service 里，优先用注入的 `ILogger<T>`。

因为入口处依赖注入可能还没建立，只能用 Serilog 静态日志器。而业务代码里注入 `ILogger<T>` 更干净。

## ✦ Enrich：什么时候需要额外上下文（Enrichment）

[[Enrich]] 用来给日志事件附加上下文。

常见写法：

```csharp
.Enrich.FromLogContext()
.Enrich.WithMachineName()
.Enrich.WithThreadId()
.Enrich.WithProperty("Application", "Arturia.ShortLink")
```

如果你安装了对应扩展包，可以写：

```csharp
.Enrich.WithMachineName()
.Enrich.WithThreadId()
```

`FromLogContext()` 则配合：

```csharp
using Serilog.Context;

using (LogContext.PushProperty("ConfigPath", configPath))
{
    logger.LogInformation("开始加载导航配置");
}
```

如果输出模板保留 `{Properties}`，就能看到：

```text
开始加载导航配置 { ConfigPath: "D:\\...\\Config.Json" }
```

如果删除了 `{Properties}`，这个额外属性不会显示在普通文本日志里。

所以删不删 `{Properties}`，本质取决于你是否依赖这类上下文属性。

对当前项目，我更建议先删掉。等后面真的开始做 TraceId、ConfigPath、UserAction 这类上下文诊断，再重新设计模板或改用 JSON 日志。

## ✦ 结构化日志的正确姿势（Structured Logging Practice）

推荐写法：

```csharp
logger.LogInformation("导航栏配置加载成功，共 {Count} 项", NavItems.Count);
logger.LogDebug("导航到：{ViewModelType}", viewModelType);
logger.LogWarning(routeNotFoundException, "路由未找到: {RouteKey}", routeNotFoundException.RouteKey);
logger.LogCritical(exception, "致命错误：{Title} - {Message}", title, message);
```

不推荐写法：

```csharp
logger.LogInformation($"导航栏配置加载成功，共 {NavItems.Count} 项");
logger.LogDebug("导航到：" + viewModelType);
logger.LogWarning(routeNotFoundException.Message);
logger.LogCritical(exception.ToString());
```

原因很简单：前者保留了结构化属性和异常对象，后者把信息压扁成字符串。

日志一旦被压扁，后面就很难检索、过滤和分析。

## ✦ Serilog 常用 API 速查（API Cheat Sheet）

全局日志器：

```csharp
Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .CreateLogger();

Log.Information("应用程序启动");
Log.Fatal(exception, "应用程序启动失败");
Log.CloseAndFlush();
```

最低级别：

```csharp
.MinimumLevel.Debug()
.MinimumLevel.Information()
.MinimumLevel.Override("Microsoft", LogEventLevel.Warning)
```

控制台输出：

```csharp
.WriteTo.Console()
```

文件输出：

```csharp
.WriteTo.File("logs/app.log")
```

滚动文件：

```csharp
.WriteTo.File("logs/app.log",
    rollingInterval: RollingInterval.Day,
    retainedFileCountLimit: 7)
```

异步输出：

```csharp
.WriteTo.Async(a => a.File("logs/app.log"))
```

输出模板：

```csharp
outputTemplate: "{Timestamp:yyyy-MM-dd HH:mm:ss.fff zzz} [{Level:u3}] [{SourceContext}] {Message:lj}{NewLine}{Exception}"
```

过滤：

```csharp
.Filter.ByIncludingOnly(e => e.Level >= LogEventLevel.Warning)
.Filter.ByExcluding(e => e.Properties.ContainsKey("HealthCheck"))
```

子日志器：

```csharp
.WriteTo.Logger(lc => lc
    .Filter.ByIncludingOnly(e => e.Level >= LogEventLevel.Error)
    .WriteTo.File("logs/error.log"))
```

接入 Microsoft 日志抽象：

```csharp
collection.AddLogging(logging =>
{
    logging.AddSerilog(dispose: true);
});
```

业务类注入：

```csharp
public class MyService(ILogger<MyService> logger)
{
    public void Run()
    {
        logger.LogInformation("服务开始运行");
    }
}
```

异常日志：

```csharp
logger.LogError(exception, "处理请求失败: {RequestId}", requestId);
logger.LogCritical(exception, "应用发生不可恢复错误");
```

控制台编码：

```csharp
Console.OutputEncoding = Encoding.UTF8;
```

## ✦ 这次项目里的三个坑（Lessons Learned）

第一个坑：控制台乱码。

原因是 Windows 控制台编码和程序输出编码不一致。解决方式是在 Serilog 初始化前设置：

```csharp
Console.OutputEncoding = Encoding.UTF8;
```

第二个坑：日志末尾出现 `{  }`。

原因是 `outputTemplate` 里有：

```text
{Properties}
```

而当前日志没有额外属性，所以输出空对象。解决方式是删除 `{Properties}`，或者开始认真使用上下文属性。

第三个坑：File 过滤器没有生效。

错误直觉是：

```csharp
r.File(...).Filter.ByIncludingOnly(...)
```

看起来像给 File 加过滤器，但实际上并没有按预期包住 File Sink。

正确做法是：

```csharp
r.Logger(lc => lc
    .Filter.ByIncludingOnly(...)
    .WriteTo.File(...))
```

也就是用子日志器明确限定过滤器作用范围。

## ✦ 一套适合当前项目的日志策略（Project Strategy）

对 Arturia.ShortLink 这种 Avalonia 桌面应用，我会这样设计日志：

Debug：开发期页面跳转、状态变化、轻量诊断。

Information：应用启动、配置加载开始、配置加载成功、用户主动取消。

Warning：路由未找到、可恢复异常、降级展示。

Error：功能失败但应用仍可继续运行。

Critical/Fatal：配置文件缺失、配置格式错误、启动失败、应用无法继续运行。

文件分流可以这样做：

`logs/app` 记录 Warning 到 Error，关注可恢复但需要排查的问题。

`logs/fatal` 记录 Fatal/Critical，关注导致退出的不可恢复问题。

`console` Debug 模式下输出 Debug 及以上，方便开发期观察。

这套策略的目标不是“尽可能多记日志”，而是让日志有层次、有边界、有诊断价值。

## ✦ 结语（Closing）

Serilog 最容易被低估的地方，是它看起来只是一个日志库。

但一旦把 [[StructuredLogging]]、[[MessageTemplate]]、[[Sink]]、[[Filter]]、[[OutputTemplate]]、[[SourceContext]] 这些概念串起来，它其实是一条完整的诊断管线。

这次在 Arturia.ShortLink 里接入 Serilog，踩到的几个坑都很典型：

- 中文控制台乱码，不是日志内容错了，而是编码没对齐。
- 每行后面的 `{  }`，不是异常，而是 `{Properties}` 在输出空属性集合。
- File Sink 过滤失败，不是表达式错了，而是过滤器没有包住正确的 Sink。
- Critical 不是不能用，关键要看错误是否真的导致应用不可恢复。

日志系统的价值，不在于它能写多少文本，而在于故障发生时，它能不能帮你还原现场。

这也是我现在更倾向的做法：让业务代码保持克制，让日志管线保持清晰。真正出事时，数字领地的星轨不会断在黑盒里。
