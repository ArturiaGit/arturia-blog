---
title: 'PseudoClass: Avalonia 伪类机制的底层逻辑与最佳实践'
cover: /img/bg/pseudoclass-cover.webp
abbrlink: w7x4m2k9
date: 2026-04-25 12:07:28
categories:
  - Avalonia
tags:
  - Avalonia
  - CSharp
  - PseudoClass
  - CustomControl
  - XAML
glossary:
  PseudoClass:
    title: 伪类
    brief: Avalonia 样式系统中用于描述控件状态的特殊选择器,类似 CSS 伪类
  TemplatedControl:
    title: TemplatedControl
    brief: Avalonia 自定义控件的基类,提供模板化样式支持
  InputElement:
    title: InputElement
    brief: Avalonia 输入系统的基础类,处理鼠标键盘交互事件
  Selector:
    title: 选择器
    brief: Avalonia XAML 样式匹配语法,用于定位控件并应用样式
  CustomControl:
    title: 自定义控件
    brief: 开发者继承基类创建的专属控件,封装特定业务逻辑与视觉表现
---

今天在开发 Avalonia 项目时,遇到了一个典型的 [[CustomControl]] 场景:需要实现一个可选中状态的卡片控件。在 XAML 样式中写下 `:selected` 伪类选择器后,样式却迟迟不生效。

排查后发现,伪类机制并非"写上就生效",而是需要理解其底层触发逻辑。这引发了对 Avalonia 伪类体系的系统性梳理。

在 [[Avalonia]] UI 框架中,[[PseudoClass]] 是样式系统的核心概念。它不仅是修改 UI 视觉表现的关键,更是 C# 逻辑层与 XAML 样式层解耦的桥梁。

理解伪类机制的底层逻辑,是开发高质量 [[CustomControl]] 的必修课。本文将系统剖析 Avalonia 伪类的三大分类、触发机制与手动维护策略。

## ✦ 核心原则

伪类机制的**核心原则**极其简洁:

> **是否需要手动声明和维护,完全取决于你自定义控件继承的基类是谁。**

这个原则揭示了 Avalonia 的设计哲学:底层脏活累活基类全包了,只有你创造的"新概念"才需要你自己动手。

## ✦ 第一类:基础交互与焦点状态

只要自定义控件继承自 [[Control]] 或 [[TemplatedControl]],这些伪类**永远不需要手动声明**。Avalonia 的底层输入系统和焦点系统会自动管理。

| 伪类名称 | 触发条件 | 自动管理的基类 | 需要手动声明 |
| :--- | :--- | :--- | :--- |
| `:pointerover` | 鼠标悬停 | [[InputElement]] | ❌ 不需要 |
| `:pressed` | 鼠标按下 | [[InputElement]] | ❌ 不需要 |
| `:disabled` | 控件禁用 | [[InputElement]] | ❌ 不需要 |
| `:focus` | 拥有焦点 | [[InputElement]] | ❌ 不需要 |
| `:focus-within` | 子元素拥有焦点 | [[InputElement]] | ❌ 不需要 |
| `:focus-visible` | 键盘 Tab 获得焦点 | [[InputElement]] | ❌ 不需要 |
| `:error` | 数据验证失败 | [[Control]] | ❌ 不需要 |

这些伪类直接在 XAML [[Selector]] 中使用即可:

```xml
<!-- 悬停时改变背景色 -->
<Style Selector="Button:pointerover">
    <Setter Property="Background" Value="#E0E0E0"/>
</Style>

<!-- 焦点时显示边框 -->
<Style Selector="TextBox:focus-visible">
    <Setter Property="BorderBrush" Value="#0078D7"/>
</Style>
```

C# 代码层完全不需要介入。这是 Avalonia 输入系统的高度自动化。

## ✦ 第二类:控件特有业务状态

这些伪类代表具体的**业务逻辑状态**(选中、展开、勾选等)。是否需要手动声明,取决于你继承的基类是否已实现该功能。

| 伪类名称 | 触发条件 | 内置基类支持 | 需要手动声明 |
| :--- | :--- | :--- | :--- |
| `:selected` | 项目选中 | `ListBoxItem` | ⚠️ 视情况 |
| `:checked` | 勾选状态 | `ToggleButton` | ⚠️ 视情况 |
| `:unchecked` | 未勾选状态 | `ToggleButton` | ⚠️ 视情况 |
| `:indeterminate` | 半选状态 | `CheckBox` | ⚠️ 视情况 |
| `:expanded` | 面板展开 | `Expander` | ⚠️ 视情况 |
| `:collapsed` | 面板折叠 | `Expander` | ⚠️ 视情况 |
| `:readonly` | 只读状态 | `TextBox` | ⚠️ 视情况 |
| `:dragging` | 正在拖拽 | `Thumb` | ⚠️ 视情况 |
| `:open` | 弹窗打开 | `Popup` | ⚠️ 视情况 |

### ✦ 视情况的两种情景

**情景 A:继承 TemplatedControl 自行实现**

如果继承 [[TemplatedControl]] 并自定义了一个 `IsSelected` 属性,必须手动声明伪类:

```csharp
// 1. 在类头部声明伪类
[PseudoClasses(":selected")]
public class MyCustomCard : TemplatedControl
{
    // 2. 定义业务属性
    public static readonly StyledProperty<bool> IsSelectedProperty =
        AvaloniaProperty.Register<MyCustomCard, bool>(nameof(IsSelected));

    public bool IsSelected
    {
        get => GetValue(IsSelectedProperty);
        set => SetValue(IsSelectedProperty, value);
    }

    // 3. 属性变化时触发伪类
    protected override void OnPropertyChanged(AvaloniaPropertyChangedEventArgs change)
    {
        base.OnPropertyChanged(change);

        if (change.Property == IsSelectedProperty)
        {
            var isSelected = (bool)change.NewValue;
            PseudoClasses.Set(":selected", isSelected);
        }
    }
}
```

**情景 B:继承已实现的基类**

如果继承 `ListBoxItem` 或 `ToggleButton`,基类内部已写好触发逻辑,直接在 XAML 使用:

```xml
<!-- 继承 ListBoxItem 的自定义控件 -->
<Style Selector="local|MyListBoxItem:selected">
    <Setter Property="Background" Value="#0078D7"/>
</Style>

<!-- 继承 ToggleButton 的自定义控件 -->
<Style Selector="local|MyToggleButton:checked">
    <Setter Property="Foreground" Value="Green"/>
</Style>
```

C# 代码不需要任何伪类逻辑。

## ✦ 第三类:结构型伪类

这是 Avalonia XAML 样式引擎特有的功能,基于控件在 UI 树中的**位置**动态计算。**不需要(也不能)在 C# 中手动 Set 或声明**。

| 伪类名称 | 触发条件 | 需要手动声明 |
| :--- | :--- | :--- |
| `:nth-child(n)` | 第 n 个子元素 | ❌ 不需要 |
| `:nth-last-child(n)` | 倒数第 n 个子元素 | ❌ 不需要 |
| `:first-child` | 第一个子元素 | ❌ 不需要 |
| `:last-child` | 最后一个子元素 | ❌ 不需要 |
| `:only-child` | 唯一子元素 | ❌ 不需要 |
| `:empty` | 无子元素或空文本 | ❌ 不需要 |

直接在 XAML [[Selector]] 中使用:

```xml
<!-- 列表斑马纹:偶数项灰色背景 -->
<Style Selector="ListBoxItem:nth-child(2n)">
    <Setter Property="Background" Value="#F5F5F5"/>
</Style>

<!-- 第一个元素无上边框 -->
<Style Selector="Border:first-child">
    <Setter Property="BorderThickness" Value="0,0,0,1"/>
</Style>

<!-- 最后一个元素无下边框 -->
<Style Selector="Border:last-child">
    <Setter Property="BorderThickness" Value="0,1,0,0"/>
</Style>
```

## ✦ 最佳实践决策流

开发 [[CustomControl]] 时,遵循以下决策流程:

### ✦ 决策一:基础交互判断

**问题是基础的鼠标/键盘交互吗?**

→ 直接在 XAML 使用 `:pointerover`、`:pressed`,C# 什么都不用写。

### ✦ 决策二:位置推断判断

**状态可通过 UI 树位置推断吗?**

→ 直接在 XAML 使用 `:first-child`、`:nth-child`,C# 什么都不用写。

### ✦ 决策三:业务状态判断

**引入了新的业务状态吗?**

→ **必须手动操作三步:**

1. **声明伪类**:在 C# 类头部 `[PseudoClasses(":loading")]`
2. **触发伪类**:在属性变化时 `PseudoClasses.Set(":loading", true/false)`
3. **消费伪类**:在 XAML 样式中 `Selector="controls|MyControl:loading"`

```csharp
// 自定义加载状态伪类
[PseudoClasses(":loading")]
public class MyDataCard : TemplatedControl
{
    public static readonly StyledProperty<bool> IsLoadingProperty =
        AvaloniaProperty.Register<MyDataCard, bool>(nameof(IsLoading));

    public bool IsLoading
    {
        get => GetValue(IsLoadingProperty);
        set => SetValue(IsLoadingProperty, value);
    }

    protected override void OnPropertyChanged(AvaloniaPropertyChangedEventArgs change)
    {
        base.OnPropertyChanged(change);

        if (change.Property == IsLoadingProperty)
        {
            PseudoClasses.Set(":loading", (bool)change.NewValue);
        }
    }
}
```

```xml
<!-- XAML 样式消费 -->
<Style Selector="local|MyDataCard:loading">
    <Setter Property="Opacity" Value="0.5"/>
    <Setter Property="Cursor" Value="Wait"/>
</Style>
```

## ✦ 星轨总结

在数字领地的 UI 架构中,[[PseudoClass]] 是样式与逻辑解耦的关键桥梁:

- **基础交互伪类**:输入系统自动管理,C# 零介入。
- **结构型伪类**:样式引擎自动计算,位置驱动状态。
- **业务状态伪类**:继承基类判断,新概念需手动声明。

这种设计哲学让 Avalonia 的样式系统像 CSS 一样极其强大且优雅。理解伪类的底层逻辑,才能开发出高质量、易维护的自定义控件。