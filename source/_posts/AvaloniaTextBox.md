---
title: 'AvaloniaTextBox: 真正生效的是模板里的 Border'
cover: /img/bg/avaloniatextbox-cover.webp
abbrlink: v7y4d2f8
date: 2026-05-31 20:29:34
categories:
  - Avalonia
tags:
  - Avalonia
  - XAML
  - UI/UX
glossary:
  Avalonia:
    title: Avalonia
    brief: 跨平台的 .NET UI 框架，支持 Windows、macOS、Linux、iOS、Android 和 WebAssembly。
  Fluent:
    title: Fluent 主题
    brief: 微软制定的现代视觉交互设计语言，在 Avalonia 中作为默认支持的 UI 视觉预设。
  DevTools:
    title: DevTools
    brief: Avalonia 内置的运行时可视化调试工具，可通过 F12 唤起，支持元素审查和属性实时修改。
  VisualTree:
    title: 视觉树
    brief: 描述 UI 界面中所有控件节点嵌套与渲染层级关系的树状数据结构。
  视觉树:
    title: 视觉树
    brief: 描述 UI 界面中所有控件节点嵌套与渲染层级关系的树状数据结构。
  Border:
    title: Border
    brief: Avalonia 中用于为其他控件提供边框 and 背景 of 容器控件。
  TextBlock:
    title: TextBlock
    brief: Avalonia 中用于显示轻量级只读文本的控件。
---

> 环境版本：[[Avalonia]] `12.0.4`，.NET `10`

最近在给 ArturiaLink 的短链输入框做共享样式。目标很简单：希望项目里所有输入框都可以通过一行：

```xml
<TextBox
    Classes="input"
    PlaceholderText="https://..." />
```

拿到统一的视觉效果。包括输入文字、边框状态、光标颜色，以及占位提示文本的样式。

这件事一开始看起来只是写几个 Setter。但做到 Placeholder 的时候，才发现真正关键的不是“属性怎么写”，而是要搞清楚 [[Avalonia]] 的 [[Fluent]] `TextBox` 模板里，到底是谁在显示这个占位文本。

## ✦ 从 TextBox.input 本体开始 (Start from TextBox.input itself)

共享样式的第一层，仍然是 `TextBox.input` 本体：

```xml
<Style Selector="TextBox.input">
    <Setter Property="Height" Value="40" />
    <Setter Property="Background" Value="{DynamicResource ArturiaBgSurface}" />
    <Setter Property="BorderBrush" Value="{DynamicResource ArturiaBorderDefault}" />
    <Setter Property="BorderThickness" Value="1" />
    <Setter Property="Padding" Value="8,4" />
    <Setter Property="FontFamily" Value="{StaticResource ArturiaFontFamilyBase}" />
    <Setter Property="FontSize" Value="13" />
    <Setter Property="Foreground" Value="{DynamicResource ArturiaTextMain}" />
    <Setter Property="CaretBrush" Value="{DynamicResource ArturiaBorderFocus}" />
    <Setter Property="VerticalContentAlignment" Value="Center" />
</Style>
```

这部分负责输入框本体的基本形态：高度、内边距、输入文字样式、光标颜色等。它们是控件级别的属性，放在 `TextBox.input` 上是合理的。

这里要注意一点：`FontSize="13"` 影响的是用户实际输入的文字。Placeholder 虽然可能会继承部分文本属性，但它并不应该完全跟输入内容共用同一套样式。占位提示文本应该更轻一点，比如字号更小、颜色更弱。

所以 Placeholder 的样式不能只靠改 `TextBox.input` 本体来解决。

## ✦ 真正的边框在模板里 (The Real Border is in the Template)

在调 hover 和 focus 的时候，先踩到的是边框状态的问题。

最开始写的是：

```xml
<Style Selector="TextBox.input:pointerover">
    <Setter Property="BorderBrush" Value="{DynamicResource ArturiaBorderHover}" />
</Style>
```

但界面里没什么反应。后来用 [[Avalonia]] [[DevTools]] 看 [[VisualTree]]（[[视觉树]]），才发现真正画边框的是模板里的：

```xml
Border#PART_BorderElement
```

也就是说，[[Fluent]] `TextBox` 模板内部有一个专门的 [[Border]] 来负责显示输入框边界。只改 `TextBox` 本体的 `BorderBrush`，不一定能改到最终显示出来的那层边框。

所以状态样式需要写到模板元素上：

```xml
<Style Selector="^ /template/ Border#PART_BorderElement">
    <Setter Property="Background" Value="{DynamicResource ArturiaBgSurface}" />
    <Setter Property="BorderBrush" Value="{DynamicResource ArturiaBorderDefault}" />
    <Setter Property="BorderThickness" Value="1" />
</Style>

<Style Selector="^:pointerover /template/ Border#PART_BorderElement">
    <Setter Property="BorderBrush" Value="{DynamicResource ArturiaBorderHover}" />
    <Setter Property="BorderThickness" Value="1" />
</Style>

<Style Selector="^:focus-within /template/ Border#PART_BorderElement">
    <Setter Property="BorderBrush" Value="{DynamicResource ArturiaBorderFocus}" />
    <Setter Property="BorderThickness" Value="1,1,1,2" />
</Style>
```

这里用了 `^`。在 [[Avalonia]] 的嵌套样式里，`^` 代表父级 selector。外层是：

```xml
<Style Selector="TextBox.input">
```

所以：

```xml
^:pointerover /template/ Border#PART_BorderElement
```

就等价于：

```xml
TextBox.input:pointerover /template/ Border#PART_BorderElement
```

这样写的好处是，所有和 `TextBox.input` 相关的子样式都收在一个块里，看起来更像一个完整组件，而不是散在文件里的零碎规则。

## ✦ PlaceholderText 不是 Watermark (PlaceholderText is not Watermark)

接着是 Placeholder。

在 [[Avalonia]] `12.0.4` 中，推荐的调用方式是：

```xml
<TextBox
    Classes="input"
    PlaceholderText="https://..." />
```

不要再把对外 API 写成 `Watermark`。在当前的 `TextBox` 里，语义上应该使用 `PlaceholderText`。这件事很小，但对以后维护很重要，因为代码读起来会更符合当前版本的控件命名。

后来我去翻了 `TextBox` 的源码，里面已经很明确：

```xml
<TextBlock Name="PART_Placeholder"
           Foreground="{TemplateBinding PlaceholderForeground}"
           Opacity="{DynamicResource TextControlPlaceholderOpacity}"
           Text="{TemplateBinding PlaceholderText}"
           TextAlignment="{TemplateBinding TextAlignment}"
           TextWrapping="{TemplateBinding TextWrapping}"
           HorizontalAlignment="{TemplateBinding HorizontalContentAlignment}"
           VerticalAlignment="{TemplateBinding VerticalContentAlignment}">
```

真正显示占位提示文本的是：

```xml
TextBlock#PART_Placeholder
```

这才是应该命中的元素。

## ✦ 颜色可以从 PlaceholderForeground 走 (Colors can be configured via PlaceholderForeground)

从源码还可以看到一件事：`PART_Placeholder` 的颜色不是随便来的，而是绑定了 `TextBox` 的 `PlaceholderForeground`：

```xml
Foreground="{TemplateBinding PlaceholderForeground}"
```

所以如果只是想改 Placeholder 的颜色，其实可以直接在 `TextBox.input` 上写：

```xml
<Setter Property="PlaceholderForeground" Value="{DynamicResource ArturiaTextPlaceholder}" />
```

这比直接进入模板改 `Foreground` 更符合控件本身的设计。

不过字体族、字号、字重这些属性，源码里的 `PART_Placeholder` 并没有通过对应的 `TemplateBinding` 暴露出来。所以如果要让 Placeholder 的文字样式和输入文字区分开，还是需要命中模板内部的 `[[TextBlock]]#PART_Placeholder`。

也就是说，最终可以分成两层：

```xml
<Style Selector="TextBox.input">
    <Setter Property="PlaceholderForeground" Value="{DynamicResource ArturiaTextPlaceholder}" />
</Style>
```

负责颜色。

```xml
<Style Selector="^ /template/ TextBlock#PART_Placeholder">
    <Setter Property="FontFamily" Value="{StaticResource ArturiaFontFamilyBase}" />
    <Setter Property="FontSize" Value="12" />
    <Setter Property="FontWeight" Value="Regular" />
</Style>
```

负责字体样式。

这样结构更清楚：能通过控件属性表达的，就写在控件本体；必须命中模板元素的，再进入 `/template/`。

## ✦ 最终结构 (The Final Structure)

整理下来，`TextBox.input` 大概会变成这样：

```xml
<Style Selector="TextBox.input">
    <Setter Property="Height" Value="40" />
    <Setter Property="Background" Value="{DynamicResource ArturiaBgSurface}" />
    <Setter Property="BorderBrush" Value="{DynamicResource ArturiaBorderDefault}" />
    <Setter Property="BorderThickness" Value="1" />
    <Setter Property="Padding" Value="8,4" />
    <Setter Property="FontFamily" Value="{StaticResource ArturiaFontFamilyBase}" />
    <Setter Property="FontSize" Value="13" />
    <Setter Property="Foreground" Value="{DynamicResource ArturiaTextMain}" />
    <Setter Property="CaretBrush" Value="{DynamicResource ArturiaBorderFocus}" />
    <Setter Property="PlaceholderForeground" Value="{DynamicResource ArturiaTextPlaceholder}" />
    <Setter Property="VerticalContentAlignment" Value="Center" />

    <Style Selector="^ /template/ Border#PART_BorderElement">
        <Setter Property="Background" Value="{DynamicResource ArturiaBgSurface}" />
        <Setter Property="BorderBrush" Value="{DynamicResource ArturiaBorderDefault}" />
        <Setter Property="BorderThickness" Value="1" />
    </Style>

    <Style Selector="^:pointerover /template/ Border#PART_BorderElement">
        <Setter Property="BorderBrush" Value="{DynamicResource ArturiaBorderHover}" />
        <Setter Property="BorderThickness" Value="1" />
    </Style>

    <Style Selector="^:focus-within /template/ Border#PART_BorderElement">
        <Setter Property="BorderBrush" Value="{DynamicResource ArturiaBorderFocus}" />
        <Setter Property="BorderThickness" Value="1,1,1,2" />
    </Style>

    <Style Selector="^ /template/ TextBlock#PART_Placeholder">
        <Setter Property="FontFamily" Value="{StaticResource ArturiaFontFamilyBase}" />
        <Setter Property="FontSize" Value="12" />
        <Setter Property="FontWeight" Value="Regular" />
    </Style>
</Style>
```

实际项目里还可以继续保留 `:disabled`、`:focus` 等状态，这里只是把最关键的结构抽出来看。

## ✦ 这次真正学到的东西 (What was learned this time)

这次最大的经验不是“怎么把 Placeholder 改成某个颜色”，而是怎么判断一个样式为什么没生效。

如果改的是：

```xml
TextBox.input:pointerover
```

但真正显示边框的是：

```xml
[[Border]]#PART_BorderElement
```

那 hover 很可能不会按预期工作。

如果想改 Placeholder 的字体样式，就要先确认模板里负责显示 Placeholder 的元素是谁。对 [[Avalonia]] `12.0.4` 的 [[Fluent]] `TextBox` 来说，它就是：

```xml
[[TextBlock]]#PART_Placeholder
```

[[Avalonia]] 的样式系统很强，但它要求我们知道自己到底在改哪一层：控件本体、模板部件、状态，还是占位提示文本。很多时候，差的不是一个 Setter，而是 selector 有没有命中正确的模板元素。

对这个 `TextBox.input` 来说，现在比较清晰的原则是：

基础输入文字样式写在 `TextBox.input` 上。

Placeholder 文本内容由调用方使用 `PlaceholderText` 提供。

Placeholder 颜色优先通过 `PlaceholderForeground` 设置。

Placeholder 字号、字体族、字重命中 `[[TextBlock]]#PART_Placeholder`。

边框状态命中 `[[Border]]#PART_BorderElement`。

组件内部规则用 `^` 收拢起来。

到这里，这个输入框样式就不再是单纯“堆 Setter”了，而是对 [[Avalonia]] [[Fluent]] `TextBox` 模板结构的一次小型适配。后面继续加错误态、只读态、清除按钮，都会更有底气。

源码参考：[TextBox.xaml](https://github.com/AvaloniaUI/Avalonia/blob/master/src/Avalonia.Themes.Fluent/Controls/TextBox.xaml)
