---
title: 'TitleBar: Avalonia 自定义标题栏实践'
cover: /img/bg/titlebar-cover.webp
abbrlink: u7v6w5x4
date: 2026-05-31 12:00:00
categories:
  - Avalonia踩坑日记
tags:
  - Avalonia
  - XAML
  - C#
  - UI/UX
glossary:
  ExtendClientArea:
    title: ExtendClientArea (客户区扩展)
    brief: Avalonia 提供的窗口属性，允许将应用 UI 内容绘制到原本属于操作系统窗口标题栏的非客户区。
  ElementRole:
    title: ElementRole (元素角色)
    brief: 窗口装饰属性之一，将指定区域标记为 `TitleBar` 角色，通知操作系统与窗口管理器该区域应响应鼠标拖拽、双击最大化等原生行为。
  WindowDecorations:
    title: WindowDecorations (窗口装饰)
    brief: 控制窗口边框和系统控制按钮的显示模式。常用配置为 `BorderOnly`，隐藏系统标题栏但保留原生窗口缩放边框与阴影。
---

在桌面应用开发中，自定义标题栏是一个非常高频的需求。为了实现无缝的一体化视觉设计，我们往往需要隐藏系统自带的标题栏，并自行绘制最小化、最大化和关闭按钮。

然而，标题栏不仅承载视觉，还牵涉到窗口拖拽、双击最大化、边缘贴边等一系列底层的操作系统行为。本文将基于真实的桌面项目实践，介绍如何在 Avalonia 中实现一个完美的自定义标题栏。

---

## ✦ 核心逻辑与配置 (Core Logic and Configuration)

要实现自定义标题栏，我们首先需要配置窗口（Window）的几个核心属性，将 UI 渲染范围延伸至系统标题栏区域，同时确保保留窗口的基本缩放边框和阴影。

```xml
<Window
    ExtendClientAreaTitleBarHeightHint="48"
    ExtendClientAreaToDecorationsHint="True"
    WindowDecorations="BorderOnly"
    WindowStartupLocation="CenterScreen">
</Window>
```

这里有三个至关重要的属性：
1. **`ExtendClientAreaToDecorationsHint="True"`**：开启 [[ExtendClientArea]]，允许我们的 UI 画进原本的窗口装饰区。
2. **`ExtendClientAreaTitleBarHeightHint="48"`**：告知操作系统与框架，我们自绘的标题栏物理高度为 48px，使贴边交互与命中测试更准确。
3. **`WindowDecorations="BorderOnly"`**：配置 [[WindowDecorations]] 为 `BorderOnly`。如果使用 `None`，虽然同样隐藏了标题栏，但往往会丢失系统的拖拽缩放边框、窗口阴影以及圆角效果。

---

## ✦ 经典布局实现 (Layout Implementation)

在布局上，自定义标题栏必须明确划分为两个逻辑区域：
* **可拖拽区域**：需要标记特殊的 [[ElementRole]]，使用鼠标按住此处可以拖拽窗口、双击最大化。
* **交互按钮区域**：放置最小化、最大化和关闭等按钮，该区域**绝对不能**标记为标题栏角色，否则点击事件会被操作系统拖拽命中拦截。

下面是 MainWindow 完整的 XAML 结构与样式实现：

```xml
<Window
    ExtendClientAreaTitleBarHeightHint="48"
    ExtendClientAreaToDecorationsHint="True"
    Icon="/Assets/avalonia-logo.ico"
    MaxHeight="800"
    MaxWidth="1280"
    Title=""
    WindowDecorations="BorderOnly"
    WindowStartupLocation="CenterScreen"
    mc:Ignorable="d"
    x:Class="ArturiaLink.Client.Views.MainWindow"
    x:DataType="vm:MainWindowViewModel"
    xmlns="https://github.com/avaloniaui"
    xmlns:d="http://schemas.microsoft.com/expression/blend/2008"
    xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
    xmlns:vm="using:ArturiaLink.Client.ViewModels"
    xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">

    <Window.Styles>
        <!-- 基础窗口按钮样式 -->
        <Style Selector="Button.caption-button">
            <Setter Property="Background" Value="Transparent" />
            <Setter Property="BorderBrush" Value="Transparent" />
            <Setter Property="BorderThickness" Value="0" />
            <Setter Property="Height" Value="48" />
            <Setter Property="Width" Value="46" />
            <Setter Property="Padding" Value="0" />
            <Setter Property="CornerRadius" Value="0" />
            <Setter Property="HorizontalContentAlignment" Value="Center" />
            <Setter Property="VerticalContentAlignment" Value="Center" />

            <Style Selector="^:pointerover /template/ ContentPresenter">
                <Setter Property="Background" Value="{DynamicResource ArturiaBtnSecondaryHover}" />
            </Style>

            <Style Selector="^:pressed /template/ ContentPresenter">
                <Setter Property="Background" Value="{DynamicResource ArturiaCaptionPressed}" />
            </Style>
        </Style>

        <!-- 关闭按钮悬停与按下状态危险色提示 -->
        <Style Selector="Button.caption-button.close-button:pointerover /template/ ContentPresenter">
            <Setter Property="Background" Value="{DynamicResource ArturiaDanger}" />
            <Setter Property="TextElement.Foreground" Value="{DynamicResource ArturiaOnPrimary}" />
        </Style>
        <Style Selector="Button.caption-button.close-button:pressed /template/ ContentPresenter">
            <Setter Property="Background" Value="{DynamicResource ArturiaDangerPressed}" />
            <Setter Property="TextElement.Foreground" Value="{DynamicResource ArturiaOnPrimary}" />
        </Style>

        <!-- 窗口按钮内图标样式 -->
        <Style Selector="PathIcon.caption-icon">
            <Setter Property="Width" Value="12" />
            <Setter Property="Height" Value="12" />
        </Style>
    </Window.Styles>

    <Grid RowDefinitions="48,*">
        <!-- 自定义标题栏容器 -->
        <Border
            Background="{DynamicResource ArturiaBgWindow}"
            BorderBrush="{DynamicResource ArturiaBorderDefault}"
            BorderThickness="0,0,0,1"
            Grid.Row="0">
            <Grid ColumnDefinitions="*,Auto">
                
                <!-- 左侧：品牌展示与空白区 (声明为可拖拽 TitleBar 角色) -->
                <Border
                    Background="Transparent"
                    Grid.Column="0"
                    Padding="16,0,0,0"
                    WindowDecorationProperties.ElementRole="TitleBar">
                    <StackPanel HorizontalAlignment="Left" Orientation="Horizontal">
                        <Border
                            Height="24"
                            Margin="0,0,8,0"
                            Width="24">
                            <PathIcon
                                Data="{StaticResource Logo}"
                                Foreground="{DynamicResource ArturiaTextMain}"
                                Height="18"
                                VerticalAlignment="Center"
                                Width="18" />
                        </Border>
                        <TextBlock
                            FontFamily="{StaticResource ArturiaFontFamilyBrand}"
                            FontSize="18"
                            FontWeight="Bold"
                            Foreground="{DynamicResource ArturiaTextMain}"
                            Text="Arturia"
                            VerticalAlignment="Center" />
                        <TextBlock
                            FontFamily="{StaticResource ArturiaFontFamilyBrand}"
                            FontSize="18"
                            FontWeight="Regular"
                            Foreground="{DynamicResource ArturiaTextMuted}"
                            Text="Link"
                            VerticalAlignment="Center" />
                    </StackPanel>
                </Border>
                
                <!-- 右侧：控制按钮区 (不声明 TitleBar 角色) -->
                <StackPanel
                    Grid.Column="1"
                    HorizontalAlignment="Right"
                    Orientation="Horizontal">
                    <Button Classes="caption-button" Click="MinimizeButton_OnClick">
                        <PathIcon Classes="caption-icon" Data="{StaticResource Minimize}" />
                    </Button>
                    <Button Classes="caption-button" Click="MaximizeButton_OnClick">
                        <PathIcon
                            Classes="caption-icon"
                            Data="{StaticResource Maximize}"
                            x:Name="MaximizeRestoreIcon" />
                    </Button>
                    <Button Classes="caption-button close-button" Click="CloseButton_OnClick">
                        <PathIcon Classes="caption-icon" Data="{StaticResource Close}" />
                    </Button>
                </StackPanel>
            </Grid>
        </Border>
        
        <!-- 下方主要内容区域 -->
        <Grid Grid.Row="1">
            <!-- 业务 UI -->
        </Grid>
    </Grid>
</Window>
```

---

## ✦ 核心交互逻辑 (Interaction Logic)

窗口的最小化、最大化、恢复和关闭等状态逻辑，属于窗口外壳控制行为。这类与具体 UI 外壳高度绑定的逻辑应直接置于 Window 的 Code-behind 中，避免让业务 ViewModel 引入平台或窗口实例相关的状态。

同时，我们需要监听窗口状态属性的变化，动态更新最大化与向下还原的按钮图标。

`MainWindow.axaml.cs` 的具体实现如下：

```csharp
using Avalonia;
using Avalonia.Controls;
using Avalonia.Interactivity;
using Avalonia.Media;

namespace ArturiaLink.Client.Views;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        PropertyChanged += OnWindowPropertyChanged;
    }

    private void MinimizeButton_OnClick(object? sender, RoutedEventArgs e)
    {
        WindowState = WindowState.Minimized;
    }

    private void MaximizeButton_OnClick(object? sender, RoutedEventArgs e)
    {
        WindowState = WindowState == WindowState.Maximized
            ? WindowState.Normal
            : WindowState.Maximized;
    }

    private void CloseButton_OnClick(object? sender, RoutedEventArgs e)
    {
        Close();
    }

    private void OnWindowPropertyChanged(object? sender, AvaloniaPropertyChangedEventArgs e)
    {
        // 监听窗口最大化与正常状态切换，更新对应的图标
        if (e.Property == WindowStateProperty)
        {
            UpdateMaximizeRestoreIcon();
        }
    }

    private void UpdateMaximizeRestoreIcon()
    {
        var resourceKey = WindowState == WindowState.Maximized ? "Restore" : "Maximize";

        if (this.TryFindResource(resourceKey, out var resource) && resource is Geometry geometry)
        {
            MaximizeRestoreIcon.Data = geometry;
        }
    }
}
```

---

## ✦ 踩坑与避坑指南 (Common Pitfalls and Best Practices)

1. **不可将右侧按钮区误判为 TitleBar**
   如果图省事将整个顶栏容器设置为 `WindowDecorationProperties.ElementRole="TitleBar"`，操作系统的拖拽热区会覆盖掉右侧按钮，导致最小化、最大化和关闭按钮无法被正常点击，或者触发点击时产生奇怪的命中冲突。
2. **拒绝硬编码尺寸**
   自定义标题栏按钮（Caption Button）为了符合系统原生习惯，高度建议完美匹配标题栏高度（如本例中的 48px），宽度在 45px ~ 48px 之间。同时应去除所有的 `CornerRadius` 和内边距，使悬停背景色块无缝填充。
3. **最大化与还原图标的精细化切换**
   一定要通过监听 `WindowStateProperty` 动态切换最大化与还原状态的图标，不能只展示静态图标，否则会在窗口状态改变后给用户带来错误的视觉反馈。
