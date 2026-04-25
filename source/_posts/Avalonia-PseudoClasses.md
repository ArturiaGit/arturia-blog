---
title: 'Avalonia 伪类：从困惑到清晰的控件样式哲学'
cover: /img/bg/avalonia-cover.webp
abbrlink: a3k8p2xz
date: 2026-04-25 10:30:00
categories:
  - .NET
tags:
  - Avalonia
  - WPF
  - 自定义控件
  - XAML
glossary:
  PseudoClasses:
    title: 伪类（Pseudo-classes）
    brief: Avalonia 中用于表示控件状态的样式选择器，如 :pointerover、:pressed、:selected，类似 CSS 伪类。
  TemplatedControl:
    title: TemplatedControl
    brief: Avalonia 中用于创建自定义控件的基础类，提供控件模板、样式、属性系统等核心能力。
---

今天在写一个 Avalonia 自定义控件时，遇到了一个看起来很简单但让我困惑的问题：我定义了一个 `IsSelected` 属性，想根据它切换样式，却不知道该用 `:selected` 还是自己造一个 `:my-selected`，更不知道伪类到底要不要手动触发。

一番挖掘后，我发现 Avalonia 的伪类系统远比我想象的优雅——它把"谁负责触发"这件事划分得极其清晰。

## ✦ 核心原则：继承谁，决定你做什么

伪类是否需要手动声明和维护，**完全取决于你的自定义控件继承的基类是谁**。

这条原则能解决 90% 的困惑：
- 基类已经实现的交互/状态，你直接用，不用管
- 你自己引入的新概念/新状态，必须手动声明和触发

Avalonia 把伪类分成三类，每一类的"责任边界"都不同。

## ✦ 第一类：基础交互状态（完全自动）

只要你的自定义控件继承自 `Control` 或 `TemplatedControl`——这覆盖了 99% 的场景——这些伪类**永远不需要手动声明**。

Avalonia 的输入系统和焦点系统会自动为你管理：

| 伪类 | 触发条件 | 需要手动 Set？ |
|:--|:--|:--|
| `:pointerover` | 鼠标/指针悬停 | ❌ 不需要 |
| `:pressed` | 鼠标左键/触摸按下 | ❌ 不需要 |
| `:disabled` | `IsEnabled=false` | ❌ 不需要 |
| `:focus` | 拥有键盘/逻辑焦点 | ❌ 不需要 |
| `:focus-within` | 内部某个子元素拥有焦点 | ❌ 不需要 |
| `:focus-visible` | 通过键盘 Tab 获得焦点 | ❌ 不需要 |
| `:error` | 数据验证失败 | ❌ 不需要 |

这些是 **InputElement** 层级实现的能力，底层输入系统自动维护状态，你只需要在 XAML 里写样式：

```xml
<Style Selector="local|MyControl:pointerover">
    <Setter Property="Background" Value="{DynamicResource SystemAccentColor}"/>
</Style>
```

C# 代码什么都不用写。

## ✦ 第二类：控件业务状态（视基类而定）

这类伪类代表具体的**业务逻辑**——选中、展开、勾选等。

是否需要手动声明？取决于你的基类是否已经实现了这个逻辑。

| 伪类 | 含义 | 默认自带此伪类的基类 |
|:--|:--|:--|
| `:selected` | 项目被选中 | `ListBoxItem`, `TabItem`, `TreeViewItem` |
| `:checked` | 处于勾选状态 | `ToggleButton`, `RadioButton`, `CheckBox` |
| `:unchecked` | 未勾选状态 | `ToggleButton`, `RadioButton`, `CheckBox` |
| `:indeterminate` | 不确定状态（半选） | `CheckBox` |
| `:expanded` | 面板已展开 | `Expander`, `TreeViewItem` |
| `:collapsed` | 面板已折叠 | `Expander`, `TreeViewItem` |
| `:readonly` | 只读状态 | `TextBox` |
| `:dragging` | 正在拖拽 | `Thumb` |
| `:open` | 弹出窗口已打开 | `Popup`, `Flyout` |

### ✦ 情景 A：继承 TemplatedControl，自己实现 IsSelected

这是我遇到的情况。因为我继承的是 `TemplatedControl`，它底层根本不懂什么是"选中"。

**必须手动声明和触发：**

```csharp
[PseudoClasses(":selected")]
public class MyCustomControl : TemplatedControl
{
    public static readonly StyledProperty<bool> IsSelectedProperty =
        AvaloniaProperty.Register<MyCustomControl, bool>(nameof(IsSelected));

    public bool IsSelected
    {
        get => GetValue(IsSelectedProperty);
        set => SetValue(IsSelectedProperty, value);
    }

    protected override void OnPropertyChanged(AvaloniaPropertyChangedEventArgs change)
    {
        base.OnPropertyChanged(change);

        if (change.Property == IsSelectedProperty)
        {
            PseudoClasses.Set(":selected", IsSelected);
        }
    }
}
```

XAML 中使用：

```xml
<Style Selector="local|MyCustomControl:selected">
    <Setter Property="Background" Value="{DynamicResource SystemAccentColor}"/>
</Style>
```

### ✦ 情景 B：继承 ListBoxItem 或 ToggleButton

如果直接继承自带业务状态的基类，**不需要写任何 C# 伪类逻辑**，基类内部已经处理好了触发：

```xml
<!-- 直接用就行，基类会自动维护 :selected 状态 -->
<Style Selector="local|MyCustomListBoxItem:selected">
    <Setter Property="Background" Value="{DynamicResource SystemAccentColor}"/>
</Style>
```

## ✦ 第三类：结构型伪类（永远不需 C# 介入）

这类伪类是 Avalonia 样式引擎的"语法糖"，基于控件在 UI 树中的**位置**动态计算。

**不需要（也不能）在 C# 中手动 Set 或声明**：

| 伪类 | 含义 |
|:--|:--|
| `:nth-child(n)` | 是父容器中第 n 个子元素（支持 2n、2n+1 等） |
| `:nth-last-child(n)` | 倒数第 n 个子元素 |
| `:first-child` | 第一个子元素 |
| `:last-child` | 最后一个子元素 |
| `:only-child` | 唯一的子元素 |
| `:empty` | 无子元素，或 TextBox 无文本 |

典型用法——列表斑马纹：

```xml
<Style Selector="ListBoxItem:nth-child(2n+1)">
    <Setter Property="Background" Value="#F5F5F5"/>
</Style>
```

这是纯 XAML 层面的能力，样式引擎自动解析，C# 完全不用管。

## ✦ 决策流：我到底该不该手动处理？

开发自定义控件时，按这个流程判断：

**1. 它是基础鼠标/键盘交互吗？**
👉 直接在 XAML 中用 `:pointerover`、`:pressed`，C# 不用写。

**2. 它的状态可以通过 UI 树中的位置推断吗？**
👉 直接在 XAML 中用 `:first-child`、`:nth-child`，C# 不用写。

**3. 我引入了新的业务状态吗？**（如 `IsLoading`、`IsPlaying`、自己实现的 `IsSelected`）
👉 **必须手动操作：**

```csharp
// 1. 类头部声明
[PseudoClasses(":loading")]
public class MyControl : TemplatedControl { ... }

// 2. 属性变化时触发
PseudoClasses.Set(":loading", isLoading);
```

```xml
<!-- 3. XAML 中消费 -->
<Style Selector="local|MyControl:loading">
    <Setter Property="Opacity" Value="0.5"/>
</Style>
```

## ✦ 设计哲学：像 CSS 一样优雅

Avalonia 的这套设计哲学，让样式系统像 CSS 一样强大且优雅：

- **底层脏活累活基类全包了**——输入、焦点、选中逻辑
- **只有你创造的"新概念"才需要你动手**——自定义业务状态

这不是"框架帮你省事"，而是"职责边界清晰"。

在数字领地里，好的架构不是让代码变少，而是让每行代码落在它该在的位置上。