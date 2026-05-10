---
title: 'RegionNavigation: 在 Avalonia 中实现区域导航功能'
cover: /img/bg/regionnavigation-cover.jpg
abbrlink: h0zy6o81
date: 2026-05-05 13:41:18
categories:
  - .NET
  - Avalonia
tags:
  - 区域导航
  - Avalonia
  - MVVM
  - Prism
glossary:
  RegionNavigation:
    title: 区域导航
    brief: 通过区域管理器实现视图的动态切换与加载，是构建复杂 UI 架构的核心模式
  Prism:
    title: Prism 框架
    brief: 微软开源的 MVVM 框架，提供依赖注入、区域导航、事件聚合器等企业级功能
  IRegionManager:
    title: 区域管理器接口
    brief: 定义区域注册与导航操作的抽象契约，是区域导航体系的核心接口
  RegionManager:
    title: 区域管理器
    brief: IRegionManager 的具体实现，管理区域控件映射与视图切换逻辑
  ContentControl:
    title: 内容控件
    brief: Avalonia 中用于承载单一视图的容器控件，是区域导航的挂载点
  UserControl:
    title: 用户控件
    brief: 可复用的 UI 组件，通常作为导航目标页面的基类
  DI:
    title: 依赖注入
    brief: 通过外部容器管理对象创建与生命周期的设计模式
  MVVM:
    title: MVVM 模式
    brief: Model-View-ViewModel 架构，通过数据绑定实现 UI 与逻辑分离
  ViewModel:
    title: 视图模型
    brief: MVVM 中封装业务逻辑并驱动 UI 更新的核心组件
  RelayCommand:
    title: Relay 命令
    brief: CommunityToolkit.Mvvm 提供的 ICommand 实现，简化命令绑定
  ConcurrentDictionary:
    title: 并发字典
    brief: .NET 提供的线程安全字典集合，适用于多线程环境下的键值存储
  WeakReference:
    title: 弱引用
    brief: 不阻止 GC 回收的引用类型，用于缓存场景避免内存泄漏
---

## ✦ 架构起点：为什么需要区域导航（Why Region Navigation）

在构建复杂 [[Avalonia]] 应用时，我们常常面临一个底层逻辑问题：如何管理多个视图的切换与加载。传统的硬编码方式（如直接设置 `Content` 属性）在小型项目中或许可行，但随着页面数量增长，这种做法会迅速演变为维护噩梦。

[[RegionNavigation]] 的本质，是将视图的创建与切换职责从使用方剥离出来，交由一个外部的 [[IRegionManager]] 统一管理。这样做的好处显而易见：视图解耦更彻底、切换逻辑更集中、生命周期管理更可控。对于深耕 .NET 生态的开发者来说，这是构建可扩展 UI 架构的标配方案。

本文将介绍两种实现区域导航的路径：使用 [[Prism]] 框架（项目推荐）和自定义实现。两种方案各有适用场景，读者可根据项目需求灵活选择。

## ✦ 方法一：使用 Prism 框架（Prism Framework）

[[Prism]] 是微软开源的 [[MVVM]] 框架，提供了依赖注入、区域导航、事件聚合器等企业级功能。对于新项目，这是最稳妥的选择。

### ✦ 第一步：安装 Prism.Avalonia（Install Prism.Avalonia）

首先通过 [[NuGet]] 安装 Prism 的 Avalonia 适配包：

```bash
dotnet add package Prism.Avalonia --version 8.1.97.11073
```

这个包提供了 `PrismApplication`、`IRegionManager` 等核心类型，是整个区域导航体系的基石。

### ✦ 第二步：修改 App.axaml.cs（Modify App.axaml.cs）

将 `App` 类的基类从 `Application` 改为 `PrismApplication`，并重写必要的生命周期方法：

```csharp
public partial class App : PrismApplication
{ 
    protected override void RegisterTypes(IContainerRegistry containerRegistry)
    {
        
    }

    protected override AvaloniaObject CreateShell() => Container.Resolve<MainWindow>();
}
```

这里有两个关键点：

- **`RegisterTypes`**：用于注册服务和页面类型，类似于传统 [[DI]] 容器的配置入口。
- **`CreateShell`**：指定应用启动时加载的主窗口，通过容器解析确保依赖正确注入。

### ✦ 第三步：注册导航页面（Register Navigation Pages）

假设已经创建了两个页面 `FirstPageView` 和 `SecondPageView`（类型为 [[UserControl]]），需要在 `RegisterTypes` 中注册为可导航视图：

```csharp
public partial class App : PrismApplication
{ 
    protected override void RegisterTypes(IContainerRegistry containerRegistry)
    {
        containerRegistry.RegisterForNavigation<FirstPageView>();//注册了FirstPageView
        containerRegistry.RegisterForNavigation<SecondPageView>();//注册了SecondPageView
    }

    protected override AvaloniaObject CreateShell() => Container.Resolve<MainWindow>();
}
```

`RegisterForNavigation` 方法将页面类型注册到 [[Prism]] 的导航服务中，后续可通过名称进行动态解析。

### ✦ 第四步：设置导航区域与命令（Setup Region and Commands）

在 XAML 中定义导航按钮和区域容器：

```xaml
<Grid RowDefinitions="Auto,*">
        <StackPanel
            Margin="10"
            Orientation="Horizontal"
            Spacing="5">
            <Button
                Command="{Binding OpenViewCommand}"
                CommandParameter="FirstPageView"
                Content="first page" /><!--OpenViewCommand是导航命令，可以自己命名；CommandParameter参数必须要与你导航页面的完整限定名一致，比如我这里需要导航到                                                  FirstPageView页面，那么我的CommandParameter的参数值就必须是"FirstPageView"-->
            <Button
                Command="{Binding OpenViewCommand}"
                CommandParameter="SecondPageView"
                Content="second page" />
        </StackPanel>

        <Border Grid.Row="1">
            <ContentControl regions:RegionManager.RegionName="ContentRegion" /><!-- 设置导航区域的名称 -->
        </Border>
    </Grid>
```

关键配置：

- **`CommandParameter`**：必须与注册的页面名称完全一致（如 `"FirstPageView"`）。
- **`RegionName`**：附加属性，标识该 [[ContentControl]] 是一个导航区域，名称为 `"ContentRegion"`。

接下来在 [[ViewModel]] 中实现导航命令（使用 CommunityToolkit.Mvvm 的 [[RelayCommand]]）：

```csharp
	[RelayCommand]
    private void OpenView(string viewName)//由于我使用了RelayCommand命令，于是它会自动生成一个OpenViewCommand命令
    {
        _regionManager!.Regions["ContentRegion"].RequestNavigate(viewName);//注意，这里的"ContentRegion"必须与你在前端页面设置的导航区域名称一致
    }
```

`RequestNavigate` 方法接收页面名称，通过 [[Prism]] 内部的区域管理器解析并加载对应视图。

## ✦ 方法二：自定义实现区域导航（Custom Region Navigation）

对于不想引入 [[Prism]] 依赖的项目，可以自定义实现区域导航。这需要先完成 [[DI]] 容器的配置，具体方法见前文《DependencyInjection: 在 Avalonia 中实现依赖注入》。

> **前提条件**：
> 1. 已完成 [[DI]] 容器的配置。
> 2. 项目已创建两个视图页面 `FirstPageView` 和 `SecondPageView`（类型为 [[UserControl]]），并成功注册到容器中。

### ✦ 第一步：规划服务架构（Plan Service Architecture）

创建 `Services` 文件夹用于存放各种服务，在其中创建 `Navigate` 子文件夹存放导航相关服务：

```text
Services/
└── Navigate/
    ├── IRegionManager.cs
    ├── RegionManager.cs
    └── NavigationResult.cs
```

### ✦ 第二步：定义 IRegionManager 接口（Define IRegionManager Interface）

创建区域管理器的抽象契约：

```csharp
public interface IRegionManager
{
    void RegisterRegion(ContentControl regionTarget, string regionName);
    NavigationResult RequestNavigate(string regionName, Type pageType);
    ContentControl? this[string regionName] { get; }
}
```

三个核心方法：

- **`RegisterRegion`**：注册区域控件与名称的映射关系。
- **`RequestNavigate`**：执行导航操作，返回导航结果。
- **索引器**：通过区域名称快速获取对应的 [[ContentControl]]。

### ✦ 第三步：定义导航结果枚举（Define NavigationResult Enum）

创建导航操作的结果类型：

```csharp
public enum NavigationResult
{
    /// <summary>
    /// 导航成功
    /// </summary>
    Success,
    
    /// <summary>
    /// 导航失败
    /// </summary>
    Failed,
    
    /// <summary>
    /// 目标页面已经处于活动状态
    /// </summary>
    AlreadyActive,
}
```

三态设计覆盖了所有可能的导航场景，调用方可根据结果执行后续逻辑。

### ✦ 第四步：实现 RegionManager 类（Implement RegionManager Class）

创建 [[RegionManager]] 类，实现 `IRegionManager` 接口：

```csharp
public class RegionManager(IServiceProvider serviceProvider) : IRegionManager
{
    //线程安全的字典，用于存储"区域名称-区域控件"
    private static ConcurrentDictionary<string, WeakReference<ContentControl>> _regions = new();//WeakReference表示弱引用，当它为空时会被GC自动回收

    public static readonly AvaloniaProperty RegionNameProperty = 
        AvaloniaProperty.RegisterAttached<AvaloniaObject, string>("RegionName", typeof (RegionManager));//为控件创建一个附加属性，用来表示区域名称
    
    public static void SetRegionName(ContentControl regionTarget, string regionName)
    {
        if (regionTarget == null)
            throw new ArgumentNullException(nameof (regionTarget));
        
        regionTarget.SetValue(RegionNameProperty, regionName);
        if(!_regions.TryAdd(regionName, new WeakReference<ContentControl>(regionTarget)))
            throw new InvalidOperationException($"区域名称 '{regionName}' 已经存在。请确保每个区域名称唯一。");
    }

    public static string? GetRegionName(ContentControl regionTarget)
        => regionTarget != null
            ? regionTarget.GetValue(RegionNameProperty) as string
            : throw new ArgumentNullException(nameof(regionTarget));

    /// <summary>
    /// 注册导航区域，可以用于在代码后台注册区域
    /// </summary>
    /// <param name="regionTarget">区域对象</param>
    /// <param name="regionName">区域名称</param>
    public void RegisterRegion(ContentControl regionTarget, string regionName)
    {
        if(regionTarget is null)
            throw new ArgumentNullException(nameof(regionTarget));
        if(string.IsNullOrEmpty(regionName))
            throw new ArgumentException("区域名称不能为空", nameof(regionName));
        
        SetRegionName(regionTarget, regionName);
        if (_regions.TryAdd(regionName, new WeakReference<ContentControl>(regionTarget)))
            throw new InvalidOperationException($"区域名称 '{regionName}' 已经存在。请确保每个区域名称唯一。");
    }

    /// <summary>
    /// 对指定区域进行导航
    /// </summary>
    /// <param name="regionName">区域名称</param>
    /// <param name="pageType">需要导航到的视图类型</param>
    /// <returns>导航结果</returns>
    public NavigationResult RequestNavigate(string regionName, Type pageType)
    {
        if(string.IsNullOrEmpty(regionName))
            throw new ArgumentException("区域名称不能为空", nameof(regionName));
        if(pageType is null)
            throw new ArgumentException("视图名称不能为空", nameof(pageType.ToString));

        //由于我们使用字典存储了区域名称与区域控件之间的映射，于是我们可以通过区域名称来获得区域控件，进而使用Content属性来显示需要导航的页面
        ContentControl regionTarget = this[regionName] ?? throw new InvalidOperationException($"区域 '{regionName}' 不存在或未注册。");
        
        //由于我们的导航页面是在区域的Content中显示的，所以我们可以通过Content属性来获取当前显示的页面类型，如果当前页面和需要导航的页面相同则返回AlreadyActive
        Type? currentPage = regionTarget.Content?.GetType();
        if (currentPage == pageType)
            return NavigationResult.AlreadyActive;

        //我们默认将页面注册到了DI容器中，那么我们就可以通过页面类型（pageType）来从DI容器中获取相应的页面实例
        UserControl viewInstance = serviceProvider.GetService(pageType) as UserControl ?? throw new InvalidOperationException($"无法创建视图实例。请确保视图类型 '{pageType}' 已注册到 DI 容器。");
        //接下来我们将页面实例赋值给区域控件的Content属性
        regionTarget.Content = viewInstance;
        
        return NavigationResult.Success;
    }
    
    //索引器的实现
    public ContentControl? this[string regionName]
    {
        get
        {
            if(string.IsNullOrEmpty(regionName))
                throw new ArgumentException("区域名称不能为空", nameof(regionName));
            
            if(_regions.TryGetValue(regionName, out WeakReference<ContentControl>? weakRef))
            {
                if(weakRef.TryGetTarget(out ContentControl? regionTarget))
                    return regionTarget;
            }
            return null;
        }
    }
}
```

核心设计要点：

- **[[ConcurrentDictionary]]** + **[[WeakReference]]**：线程安全且支持 GC 自动回收，避免内存泄漏。
- **附加属性**：通过 `AvaloniaProperty.RegisterAttached` 为 [[ContentControl]] 扩展 `RegionName` 属性，支持 XAML 绑定。
- **DI 解析**：通过 `IServiceProvider.GetService` 从容器中获取页面实例，保持与 [[DI]] 体系的一致性。

### ✦ 第五步：注册导航服务（Register Navigation Service）

将导航服务注入到程序生命周期中：

```csharp
public static class ServiceCollectionExtensions
{
    public static void AddServices(this IServiceCollection services)
    {
        //这里我将页面都注册为了单例，因为在我这个项目里页面基本是静态不变的，所以单例我认为是最好的模式
        services.AddSingleton<MainWindow>();
        services.AddSingleton<FirstPageView>();
        services.AddSingleton<SecondPageView>();

        services.AddTransient<MainWindowViewModel>();
        
        services.AddSingleton<IRegionManager, RegionManager>();//由于我们在RegionManager中使用静态字典存储了区域名称与区域控件之间的映射，于是这里使用单例
    }
}
```

[[RegionManager]] 注册为单例是因为它内部使用静态字典存储区域映射，整个应用生命周期内只需要一个实例。

### ✦ 第六步：设置导航区域（Setup Navigation Region）

在 XAML 中注册导航区域：

```xaml
<Grid Margin="5" RowDefinitions="Auto,*">
        <StackPanel
            Margin="5"
            Orientation="Horizontal"
            Spacing="5">
            <Button
                Command="{Binding NavigateCommand}"
                CommandParameter="{x:Type views:FirstPageView}"
                Content="FirstPage" /><!--CommandParameter参数必须是需要导航页面的页面类型-->
            <Button
                Command="{Binding NavigateCommand}"
                CommandParameter="{x:Type views:SecondPageView}"
                Content="SecondPage" />
        </StackPanel>
        <Grid Grid.Row="1">
            <TransitioningContentControl navigate:RegionManager.RegionName="MainContent" />
        </Grid>
    </Grid>
```

与 [[Prism]] 方案不同，这里的 `CommandParameter` 直接绑定页面类型（`{x:Type views:FirstPageView}`），而非字符串名称。

### ✦ 第七步：实现导航命令（Implement Navigation Command）

在 [[ViewModel]] 中实现导航命令：

```csharp
public partial class MainWindowViewModel(IServiceProvider serviceProvider) : ObservableObject
{
    //从DI容器中获取导航服务
    private readonly IRegionManager _regionManager = serviceProvider.GetRequiredService<IRegionManager>();
    
    [RelayCommand]
    private void Navigate(Type pageType)
    {
        _regionManager.RequestNavigate("MainContent", pageType);//将导航区域的名称和需要导航的页面的页面类型传递给RequestNavigate方法
    }
}
```

通过构造函数注入 `IServiceProvider`，在初始化时解析 [[IRegionManager]] 实例。`Navigate` 命令接收页面类型参数，调用 `RequestNavigate` 执行导航。

### ✦ 第八步：修改 App.axaml.cs（Modify App.axaml.cs）

最后修改应用入口，接入 [[DI]] 容器：

```csharp
public partial class App : Application
{
    public override void Initialize()
    {
        AvaloniaXamlLoader.Load(this);
    }

    public override void OnFrameworkInitializationCompleted()
    {
        BindingPlugins.DataValidators.RemoveAt(0);
        
        ServiceCollection services = new ServiceCollection();
        services.AddServices();

        ServiceProvider serviceProvider = services.BuildServiceProvider();
        
        //变化不大，唯一需要注意的是我们的主窗口也是从DI容器中获取
        MainWindow mainWindow = serviceProvider.GetRequiredService<MainWindow>();
        mainWindow.DataContext = serviceProvider.GetRequiredService<MainWindowViewModel>();

        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            desktop.MainWindow = mainWindow;
        }

        base.OnFrameworkInitializationCompleted();
    }
}
```

关键点：

- **服务构建**：通过 `services.BuildServiceProvider()` 创建 [[DI]] 容器。
- **窗口解析**：主窗口和 [[ViewModel]] 都从容器中获取，确保依赖链完整。
- **生命周期绑定**：通过 `IClassicDesktopStyleApplicationLifetime` 将窗口绑定到桌面应用生命周期。

## ✦ 方案对比与选型建议（Comparison and Recommendations）

两种方案各有适用场景：

| 维度 | Prism 框架 | 自定义实现 |
|------|-----------|-----------|
| 依赖成本 | 需引入 Prism.Avalonia 包 | 无额外依赖 |
| 功能完整度 | 开箱即用，支持区域嵌套、导航日志等 | 基础功能，需自行扩展 |
| 学习曲线 | 需掌握 Prism 概念体系 | 代码直观，易于理解 |
| 适用场景 | 企业级复杂应用 | 轻量级或定制化需求 |

对于新项目，推荐使用 [[Prism]] 方案，它提供了成熟的导航体系和丰富的扩展点。对于存量项目或对依赖敏感的场景，自定义实现是更灵活的选择。

## ✦ 总结（Summary）

区域导航是构建可扩展 [[Avalonia]] 应用的核心模式。无论是采用 [[Prism]] 框架还是自定义实现，其底层逻辑都是将视图的创建与切换职责从使用方剥离出来，交由统一的 [[IRegionManager]] 管理。

掌握这一模式后，我们可以轻松应对页面动态加载、视图解耦、生命周期管理等复杂场景，为构建企业级应用奠定坚实的架构基础。
