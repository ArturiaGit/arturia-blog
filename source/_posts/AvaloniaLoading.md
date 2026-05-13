---
title: 'AvaloniaLoading: 在 Avalonia 中实现加载动画的几种方式'
cover: /img/bg/avalonialoading-cover.webp
abbrlink: k8m4q2z7
date: 2026-05-13 14:19:35
categories:
  - Avalonia
tags:
  - Avalonia
  - UI
  - MVVM
  - Lottie
glossary:
  Avalonia:
    title: Avalonia
    brief: 跨平台 .NET UI 框架，适合构建桌面应用与多平台客户端。
  ProgressBar:
    title: ProgressBar
    brief: Avalonia 内置进度控件，可用于确定进度或不确定进度加载反馈。
  Keyframe Animation:
    title: Keyframe Animation
    brief: 基于时间线和关键帧描述属性变化的动画方式。
  Transition:
    title: Transition
    brief: 当控件属性变化时自动补间的轻量动画机制。
  Page Transition:
    title: Page Transition
    brief: 页面或内容切换时使用的过渡动画。
  Composition Animation:
    title: Composition Animation
    brief: 更接近渲染层的高性能动画能力，适合复杂或高频动画。
  Lottie:
    title: Lottie
    brief: 基于 JSON 的矢量动效方案，适合复用设计工具导出的动画资源。
---

> ⚠️ **声明**：本文整理了 Avalonia 中实现加载动画的几种方式，代码片段来自个人项目实践。部分方案未经大规模验证，如有更优解法，欢迎交流。

## ✦ 起点（Starting Point）

加载动画不是一个单纯的视觉细节。

在桌面应用里，它承担的是状态沟通：程序是否还活着，配置是否正在读取，页面是否已经开始切换，用户是否需要等待。对于 [[Avalonia]] 应用来说，实现加载动画有好几条路径，从最朴素的内置控件，到完全自定义的动画时间线，再到项目级的遮罩与动效资源组合。

这篇文章先梳理几种常见方案，最后落到我的 `Arturia.ShortLink` 项目里正在使用的方案：用 [[MVVM]] 管理加载状态，用顶层遮罩接管视觉反馈，再用 [[Lottie]] 播放独立动画资源。

## ✦ 内置进度控件（ProgressBar）

最直接的方式是使用 [[ProgressBar]]。

如果任务有明确进度，比如下载、导入、批处理，可以绑定 `Value`：

```xml
<ProgressBar Minimum="0" Maximum="100" Value="{Binding Progress}" />
```

如果任务没有明确进度，比如初始化服务、读取配置、等待网络响应，可以使用不确定进度：

```xml
<ProgressBar IsIndeterminate="True" />
```

这种方式实现成本最低，也最稳定。缺点是视觉表达比较通用，适合工具型页面、表单提交、后台任务提示，不太适合启动页或品牌感更强的等待界面。

官方参考：Avalonia ProgressBar 文档  
https://docs.avaloniaui.net/docs/reference/controls/progressbar

## ✦ 关键帧动画（Keyframe Animation）

第二种方式是使用 [[Keyframe Animation]]。

它适合自己手写动画，比如旋转图标、呼吸点、淡入淡出、上下浮动。Avalonia 可以在样式里定义动画，让某个属性沿时间线变化：

```xml
<Style Selector="Border.spinner">
    <Style.Animations>
        <Animation Duration="0:0:1"
                   IterationCount="INFINITE">
            <KeyFrame Cue="0%">
                <Setter Property="RotateTransform.Angle" Value="0" />
            </KeyFrame>
            <KeyFrame Cue="100%">
                <Setter Property="RotateTransform.Angle" Value="360" />
            </KeyFrame>
        </Animation>
    </Style.Animations>
</Style>
```

这类方案的优点是纯 XAML、依赖少、可控性强。缺点是复杂动画会迅速膨胀，尤其是想做出细腻的缓动、分段、图形变化时，维护成本会变高。

官方参考：Avalonia Keyframe Animations 文档  
https://docs.avaloniaui.net/docs/guides/graphics-and-animation/keyframe-animations

## ✦ 属性过渡（Transition）

[[Transition]] 更适合状态切换，而不是持续循环动画。

比如加载遮罩从不可见变可见时，不希望它突然跳出来，可以给 `Opacity` 添加过渡：

```xml
<Border Opacity="{Binding LoadingOpacity}">
    <Border.Transitions>
        <Transitions>
            <DoubleTransition Property="Opacity"
                              Duration="0:0:0.2" />
        </Transitions>
    </Border.Transitions>
</Border>
```

它的核心价值是"属性变化时自动补间"。因此，像按钮悬停、卡片展开、遮罩淡入、内容区透明度变化，都很适合用 Transition 做。它不是加载动画本体，但常常是加载体验的润滑层。

官方参考：Avalonia Transitions 文档  
https://docs.avaloniaui.net/docs/guides/graphics-and-animation/transitions

## ✦ 页面过渡（Page Transition）

如果加载发生在页面切换过程中，可以考虑 [[Page Transition]]。

例如当前页面切换到详情页，或者路由导航到另一个 ViewModel，可以使用 `TransitioningContentControl` 配合 `CrossFade`、`PageSlide` 等过渡方式：

```xml
<TransitioningContentControl Content="{Binding CurrentView}">
    <TransitioningContentControl.PageTransition>
        <CrossFade Duration="0:0:0.2" />
    </TransitioningContentControl.PageTransition>
</TransitioningContentControl>
```

这种方式的目标不是显示"正在加载"，而是让内容切换不生硬。对于导航型桌面应用，它可以和加载遮罩搭配使用：短任务用页面过渡，长任务再显示 Loading Overlay。

官方参考：Avalonia Page Transitions 文档  
https://docs.avaloniaui.net/docs/graphics-animation/page-transitions

## ✦ 合成动画（Composition Animation）

当动画比较复杂，或者需要更接近渲染层的性能控制时，可以使用 [[Composition Animation]]。

它更适合 C# 驱动的复杂动画、视觉层动画、高频交互动画。对于普通加载提示来说，它通常不是首选，因为实现成本更高。但如果加载动画涉及大量元素、实时响应或较重的视觉效果，Composition 会比在控件层硬堆动画更稳。

官方参考：Avalonia Composition Animations 文档  
https://docs.avaloniaui.net/docs/concepts/graphics-and-animation/composition

## ✦ 项目方案（Project Pattern）

我的 `Arturia.ShortLink` 项目采用的是更工程化的方案：

1. ViewModel 中维护 [[IsLoading]] 状态。
2. 窗口 `Loaded` 后触发初始化命令。
3. 主内容区域在加载时添加 `Loading` class，并施加模糊效果。
4. 顶层 `Border` 作为加载遮罩，绑定 `IsLoading` 控制显示隐藏。
5. 遮罩中使用 [[Lottie]] 播放 `Assets/LottieFiles/loading.json`。
6. `.csproj` 中通过 [[AvaloniaResource]] 打包 `Assets/**`，保证动画 JSON 能以 `avares://` 方式加载。

核心依赖在项目文件中：

```xml
<ItemGroup>
    <AvaloniaResource Include="Assets\**"/>
</ItemGroup>

<ItemGroup>
    <PackageReference Include="Lottie" Version="11.3.0" />
</ItemGroup>
```

加载状态在 ViewModel 中定义：

```csharp
[ObservableProperty]
private bool _isLoading;

[RelayCommand]
private async Task LoadNavItems(CancellationToken cancellationToken)
{
    IsLoading = true;

    try
    {
        await Task.Delay(2000, cancellationToken);

        // 读取 Config.Json，解析导航配置，并导航到默认页面。
        await LoadConfigAndNavigateAsync(cancellationToken);
    }
    finally
    {
        IsLoading = false;
    }
}
```

窗口加载后触发命令：

```xml
<Interaction.Behaviors>
    <EventTriggerBehavior EventName="Loaded">
        <InvokeCommandAction Command="{Binding LoadNavItemsCommand}" />
    </EventTriggerBehavior>
</Interaction.Behaviors>
```

主内容在加载时模糊：

```xml
<Window.Styles>
    <Style Selector="Grid.Loading">
        <Setter Property="Effect">
            <BlurEffect Radius="15" />
        </Setter>
    </Style>
</Window.Styles>

<Grid Classes.Loading="{Binding IsLoading}">
    <!-- 主界面内容 -->
</Grid>
```

真正的加载层放在窗口最外层：

```xml
<Border
    Background="{DynamicResource Arturia.Loading.Color.Background}"
    IsVisible="{Binding IsLoading}"
    ZIndex="99">
    <StackPanel
        HorizontalAlignment="Center"
        VerticalAlignment="Center"
        Orientation="Vertical"
        Spacing="10">

        <Lottie
            Width="120"
            Height="120"
            Path="avares://Arturia.ShortLink/Assets/LottieFiles/loading.json"
            RepeatCount="-1" />

        <TextBlock
            Classes="Body"
            FontSize="20"
            FontWeight="Bold"
            HorizontalAlignment="Center"
            Text="正在初始化系统…" />

        <TextBlock
            Classes="Body"
            FontSize="16"
            HorizontalAlignment="Center"
            Text="正在加载配置文件与数据，请稍后…" />
    </StackPanel>
</Border>
```

背景色也被抽到主题资源里：

```xml
<SolidColorBrush
    x:Key="Arturia.Loading.Color.Background"
    Color="{StaticResource Arturia.Color.White.Opacity66}" />
```

## ✦ 为什么这样设计（Why This Works）

这个方案的关键不是 Lottie 本身，而是状态边界清楚。

`IsLoading` 只表达一件事：现在是否处于加载中。ViewModel 不关心动画怎么播放，View 也不关心配置怎么读取。加载开始时设为 `true`，加载结束时在 `finally` 中设回 `false`，整个流程可靠、清晰，也不容易漏掉异常场景。

Lottie 则负责视觉质量。相比手写复杂 Keyframe，它可以直接复用设计资产；相比普通 ProgressBar，它更适合作为启动初始化界面。遮罩层负责阻断用户误操作，背景模糊负责降低主界面干扰，三者组合起来，加载体验就完整了。

## ✦ 选型建议（Choosing）

如果只是普通后台任务，用 [[ProgressBar]]。

如果只是控件状态变化，用 [[Transition]]。

如果是页面导航切换，用 [[Page Transition]]。

如果要手写轻量循环动画，用 [[Keyframe Animation]]。

如果是复杂视觉或高性能动画，用 [[Composition Animation]]。

如果是启动页、品牌化等待界面，或者已有设计动效资源，用 [[Lottie]] 加状态驱动遮罩。

对 `Arturia.ShortLink` 这种"启动时读取配置、构建导航、进入默认页面"的场景来说，`IsLoading + Overlay + Lottie` 是最合适的组合。它既不把动画逻辑塞进业务代码，也不让界面在初始化期间显得僵硬。加载这件小事，最终变成了一个干净的 UI 状态模型。
