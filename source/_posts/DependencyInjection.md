---
title: 'DependencyInjection: 在 Avalonia 中实现依赖注入'
cover: /img/bg/dependencyinjection-cover.webp
abbrlink: 4292344c
date: 2026-05-05 13:11:58
categories:
  - .NET
  - Avalonia
tags:
  - 依赖注入
  - Avalonia
  - MVVM
  - IoC
glossary:
  DependencyInjection:
    title: 依赖注入
    brief: 一种设计模式，通过外部容器管理对象的创建与生命周期，实现组件间的松耦合
  IoC:
    title: IoC 容器
    brief: 控制反转容器，负责管理依赖关系和对象生命周期的基础设施
  Avalonia:
    title: Avalonia
    brief: 跨平台 .NET UI 框架，支持 Windows、Linux、macOS 等多端部署
  MVVM:
    title: MVVM 模式
    brief: Model-View-ViewModel 架构模式，通过数据绑定实现 UI 与业务逻辑的分离
  ViewModel:
    title: 视图模型
    brief: MVVM 中的核心组件，封装业务逻辑并通过属性绑定驱动 UI 更新
  DataBinding:
    title: 数据绑定
    brief: UI 元素与数据源之间的自动同步机制，是 MVVM 模式的基石
  NuGet:
    title: NuGet 包
    brief: .NET 平台的包管理器，用于分发和引用第三方库
---

## ✦ 架构起点：为什么需要依赖注入（Why Dependency Injection）

在构建 [[Avalonia]] 应用时，我们常常面临一个底层逻辑问题：组件之间的耦合度。当 [[ViewModel]] 直接 `new` 出它所依赖的服务时，就等于把对象的创建逻辑硬编码进了业务代码。这种做法在小型项目中或许无伤大雅，但随着应用规模增长，它会迅速演变为维护噩梦。

[[DependencyInjection]] 的本质，是将对象的创建职责从使用方剥离出来，交由一个外部的 [[IoC]] 统一管理。这样做的好处显而易见：测试更简单、替换实现更灵活、生命周期管理更可控。对于深耕 .NET 生态的开发者来说，这几乎是工程化的标配。

## ✦ 安装软件包（Install NuGet Package）

一切始于 [[NuGet]]。我们需要引入 Microsoft 官方提供的依赖注入库。打开终端，执行：

```bash
dotnet add package Microsoft.Extensions.DependencyInjection
```

这个包提供了 `IServiceCollection`、`ServiceProvider` 等核心类型，是整个 DI 体系的基石。它与 [[Avalonia]] 的集成非常自然，无需额外适配。

## ✦ 服务注册：构建扩展方法（Service Registration）

直接在 `App.xaml.cs` 中堆砌注册代码并非最佳实践。更优雅的方式是提取一个扩展方法，让注册逻辑集中、可复用、可测试。

```csharp
public static class ServiceCollectionExtensions
{
    public static void AddCommonServices(this IServiceCollection collection)
    {
        collection.AddSingleton<IRepository, Repository>();
        collection.AddTransient<BusinessService>();
        collection.AddTransient<MainViewModel>();
    }
}
```

这里有两个关键概念：

- **`AddSingleton`**：整个应用生命周期内只创建一个实例，适合无状态的服务或仓储。
- **`AddTransient`**：每次请求都创建新实例，适合轻量级、无共享状态的组件。

通过扩展方法，我们把服务注册从 `App.xaml.cs` 中解耦出来，使主入口保持干净。这是一种典型的"关注点分离"实践。

## ✦ 修改 App.xaml.cs：接入 IoC 容器（Wire Up IoC Container）

现在到了核心环节。我们需要改造 `App.xaml.cs`，让它通过服务容器解析 [[ViewModel]]，而不是直接实例化。

```csharp
public class App : Application
{
    public override void Initialize()
    {
        AvaloniaXamlLoader.Load(this);
    }

    public override void OnFrameworkInitializationCompleted()
    {
        // 如果使用 CommunityToolkit，则需要用下面一行移除 Avalonia 数据验证。
        // 如果没有这一行，数据验证将会在 Avalonia 和 CommunityToolkit 中重复。
        BindingPlugins.DataValidators.RemoveAt(0);

        // 注册应用程序运行所需的所有服务
        var collection = new ServiceCollection();
        collection.AddCommonServices();

        // 从 collection 提供的 IServiceCollection 中创建包含服务的 ServiceProvider
        var services = collection.BuildServiceProvider();

        var vm = services.GetRequiredService<MainViewModel>();
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            desktop.MainWindow = new MainWindow
            {
                DataContext = vm
            };
        }
        /*else if (ApplicationLifetime is ISingleViewApplicationLifetime singleViewPlatform)
        {
            singleViewPlatform.MainView = new MainView
            {
                DataContext = vm
            };
        }*/

        base.OnFrameworkInitializationCompleted();
    }
}
```

解析流程清晰可见：创建 `ServiceCollection` → 注册服务 → 构建 `ServiceProvider` → 从容器中解析 `MainViewModel` → 设置为 `MainWindow` 的 `DataContext`。

值得注意的是，`GetRequiredService<T>()` 会在服务未注册时抛出异常，这是一种防御性编程策略，能在开发阶段快速暴露配置遗漏。

## ✦ 底层逻辑：从注册到解析（Under the Hood）

整个 DI 流程可以抽象为三个阶段：

1. **注册阶段**：告诉容器"什么类型对应什么实现"。
2. **构建阶段**：`BuildServiceProvider()` 将注册信息编译为一个可执行的解析器。
3. **解析阶段**：容器根据注册信息创建或获取实例，并自动解析其构造函数依赖。

这种设计让容器能够递归地解析整个依赖图。假设 `MainViewModel` 依赖 `BusinessService`，而 `BusinessService` 又依赖 `IRepository`，容器会自动完成整条链路的实例化——这就是依赖注入的魔力所在。

## ✦ 数字领地实践建议

在实际项目中，我建议：

- **集中注册**：所有服务注册放在一个地方，便于全局审查。
- **接口优先**：尽量依赖接口而非具体类型，便于单元测试和实现替换。
- **生命周期审慎**：`Singleton` 要注意线程安全，`Transient` 要注意性能开销。
- **避免循环依赖**：这是 DI 的天敌，设计时需提前规避。

依赖注入不是银弹，但它是构建可维护、可测试应用的基础设施。在 [[Avalonia]] 的跨平台语境下，掌握这一模式，意味着你的代码能够在不同终端间保持一致的架构质量。

---

*星轨之下，底层逻辑永远是架构的基石。*
