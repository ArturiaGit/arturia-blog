---
title: 'RoutedEvent: 彻底搞懂 Avalonia 路由事件：从底层机制到 MVVM 高阶实战'
cover: /img/bg/routeevent-cover.webp
abbrlink: u6qvn1bh
date: 2026-05-11 13:47:16
categories:
  - Avalonia
tags:
  - 路由事件
  - MVVM
  - Avalonia
glossary:
  RoutingEvent:
    title: 路由事件
    brief: 事件不是只在一个对象上触发，而是可以沿着控件树按照指定方向传播的机制
  Bubble:
    title: 冒泡
    brief: 事件从最内层的事件源开始，向外层父级控件一层层传播
  Tunnel:
    title: 隧道
    brief: 事件从最外层开始，向事件源方向一层层传递
  Direct:
    title: 直接
    brief: 事件只在当前元素上触发，不向上冒泡，也不向下隧道
  MVVM:
    title: MVVM
    brief: Model-View-ViewModel，一种分离用户界面与业务逻辑的架构模式
  VisualTree:
    title: 视觉树
    brief: 控件在界面中层层嵌套形成的树形结构
  HitTest:
    title: 命中测试
    brief: 确定用户点击或交互的具体是哪个控件的过程
  EventDelegation:
    title: 事件委托
    brief: 子元素只负责展示，父级容器统一判断交互意图的模式
  Handled:
    title: Handled
    brief: 告诉事件系统这个事件我已经处理过了，后面的普通处理器可以不用管了
  PointerPressed:
    title: PointerPressed
    brief: Avalonia 中用于处理指针按下事件的事件
  ClickCount:
    title: ClickCount
    brief: PointerPressedEventArgs 中用于判断点击次数的属性
  DataContext:
    title: DataContext
    brief: 控件的数据上下文，用于绑定数据源
  Code-Behind:
    title: Code-Behind
    brief: XAML 文件对应的后台代码文件，用于处理 UI 逻辑
  DataTemplate:
    title: DataTemplate
    brief: 定义数据对象如何在界面上显示的模板
  Selector:
    title: Selector
    brief: Avalonia 样式系统中用于选择控件的语法
---

> ⚠️ **声明：** 本文中的代码尚未经过笔者的完整验证，内容是笔者在与 AI 讨论路由策略以及结合自身开发的导航功能、列表数据功能进行的拓展。如有疏漏，欢迎指正。

---

# ✦ 彻底搞懂 Avalonia 路由事件：从底层机制到 MVVM 高阶实战 (RoutedEvent Deep Dive)

## ✦ 引言 (Introduction)

如果你是从传统 WinForms、控制台程序，或者早期桌面开发方式转向 Avalonia 这类现代 XAML UI 框架，刚开始一定会有一种明显的不适感。

你会发现，界面不再是简单地拖几个控件、写几个 `Click +=` 事件那么直接。Avalonia 里有一整套新的思维方式：

- XAML；
- 数据绑定；
- 样式系统；
- 控件模板；
- [[VisualTree]]；
- [[MVVM]]；
- 以及很多人一开始最容易困惑的：**[[RoutingEvent]]**。

很多问题也会随之出现：

> 为什么普通的 C# 事件不够用了？
> 为什么我点了一个子控件，外层容器也能收到事件？
> Avalonia 里为什么没有 WPF 那种 `PreviewMouseDown`、`PreviewTextInput`？
> 既然提倡 MVVM，那我还能不能在 `.axaml.cs` 里写事件？
> 写了 [[Code-Behind]] 是不是就代表架构很差？

这篇文章不打算照搬官方文档，而是从真实开发场景出发，讲清楚 Avalonia [[RoutingEvent]] 背后的机制，以及它和 [[MVVM]] 之间到底应该如何分工。

一句话先定调：

> **视觉表现交给 Style，物理交互交给 Event，核心业务交给 ViewModel。**

理解了这句话，你就不会再纠结"事件是不是原罪"，也不会把所有东西都强行塞进 ViewModel。

---

## ✦ 为什么 Avalonia 需要路由事件？ (Why Routed Events?)

在传统桌面开发中，我们经常把控件理解成一个个独立对象。

比如：

```csharp
button.Click += OnButtonClick;
```

按钮被点击了，按钮触发事件，事件处理器执行。

这很直观。

但是在 Avalonia 里，界面并不是一个扁平结构，而是一棵层层嵌套的 [[VisualTree]]。

例如一个看似简单的按钮，真实结构可能类似这样：

```text
Window
 └── Grid
     └── Border
         └── Button
             └── ContentPresenter
                 └── TextBlock
```

当用户点击按钮上的文字时，真正被命中的可能不是 `Button` 本身，而是按钮模板内部的 `TextBlock`、`ContentPresenter` 或其他视觉元素。

这时候如果事件只能停留在最底层元素上，外层控件就很难统一管理交互。

于是，Avalonia 引入了 [[RoutingEvent]] 机制。

所谓路由事件，本质就是：

> **事件不是只在一个对象上触发，而是可以沿着控件树按照指定方向传播。**

Avalonia 的路由事件主要有三种路由策略：

### ✦ 三种路由策略 (Three Routing Strategies)

#### 1. 冒泡：Bubble

事件从最内层的事件源开始，向外层父级控件一层层传播。

类似这样：

```text
TextBlock
 -> Border
 -> Grid
 -> UserControl
 -> Window
```

这非常适合做 [[EventDelegation]]。

例如：

- 列表项统一处理点击；
- 表格行统一处理双击；
- 外层容器统一监听内部按钮事件；
- 父控件根据子控件触发情况做交互判断。

#### 2. 隧道：Tunnel

事件从最外层开始，向事件源方向一层层传递。

类似这样：

```text
Window
 -> UserControl
 -> Grid
 -> Border
 -> TextBox
```

它适合做"提前拦截"。

比如：

- 输入校验；
- 快捷键拦截；
- 某些控件拿到事件之前，外层先判断是否允许继续传播。

和 WPF 不同的是，Avalonia 并不大量使用 `PreviewXXX` 这种事件命名方式。

在 Avalonia 中，如果你想监听隧道阶段，通常使用：

```csharp
AddHandler(..., RoutingStrategies.Tunnel)
```

而不是找 `PreviewMouseDown`、`PreviewTextInput` 之类的事件名。

#### 3. 直接：Direct

事件只在当前元素上触发，不向上冒泡，也不向下隧道。

比如某些进入、离开、局部状态变化类事件，就更适合直接事件。

---

## ✦ Avalonia 和 WPF 路由事件的关键区别 (Key Differences from WPF)

如果你之前学过 WPF，切换到 Avalonia 时很容易踩坑。

下面这张表建议重点看一下：

| 主题 | WPF | Avalonia |
|---|---|---|
| 鼠标事件 | `MouseDown`、`MouseUp`、`MouseDoubleClick` | 更推荐使用 `PointerPressed`、`PointerReleased`、`PointerMoved` |
| 双击处理 | 常见 `MouseDoubleClick` | 常见 `PointerPressed + e.ClickCount` |
| 预览事件 | 常见 `PreviewMouseDown`、`PreviewTextInput` | 通常使用 `AddHandler(..., RoutingStrategies.Tunnel)` |
| 事件真实源 | 常用 `e.OriginalSource` | 常用 `e.Source` |
| 悬浮样式 | `Trigger` | 样式选择器 `:pointerover` |
| 行为库 | `Microsoft.Xaml.Behaviors.Wpf` | 常见 `Avalonia.Xaml.Behaviors` / `Avalonia.Xaml.Interactions` |

所以，如果你写的是 Avalonia 项目，就不要直接照搬 WPF 代码。

尤其要注意：

```csharp
e.OriginalSource
```

这是 WPF 里非常常见的写法。

在 Avalonia 中，更常用的是：

```csharp
e.Source
```

并且因为 `Source` 可能是内部元素，所以实际开发中通常需要从 `Source` 开始向上查找目标控件。

---

## ✦ 场景一：冒泡事件——列表和表格交互的统一管理 (Bubble Events: List and Table Interactions)

### ✦ 基础痛点 (The Pain Point)

假设你有一个用户列表，每一行都有很多可交互区域。

例如：

- 姓名列可以双击编辑；
- 年龄列可以双击编辑；
- 性别列不可编辑；
- 操作列有按钮；
- 行本身还可能支持选中、高亮、右键菜单。

如果你给每个子控件都单独写事件，代码会很快变得混乱。

更好的方式是：

> 在外层行容器上监听一次事件，然后通过事件源判断用户具体点了哪里。

这就是典型的 [[Bubble]] 事件应用。

### ✦ 多列双击编辑：Avalonia 正确写法 (Multi-column Double-click Editing)

假设一行有三列：

- 性别：不可编辑；
- 姓名：支持双击编辑；
- 年龄：支持双击编辑。

我们可以在行容器上统一监听 [[PointerPressed]]，然后通过 [[ClickCount]] 判断是不是双击。

#### XAML 示例

```xml
<Grid ColumnDefinitions="80,160,80"
      Background="Transparent"
      PointerPressed="Row_PointerPressed">

    <!-- 不可编辑列 -->
    <TextBlock Grid.Column="0"
               Text="{Binding Gender}"
               VerticalAlignment="Center" />

    <!-- 可编辑列：姓名 -->
    <Border Grid.Column="1"
            Background="Transparent"
            Padding="8,4"
            Tag="Column_Name">
        <TextBlock Text="{Binding Name}"
                   VerticalAlignment="Center" />
    </Border>

    <!-- 可编辑列：年龄 -->
    <Border Grid.Column="2"
            Background="Transparent"
            Padding="8,4"
            Tag="Column_Age">
        <TextBlock Text="{Binding Age}"
                   VerticalAlignment="Center" />
    </Border>

</Grid>
```

这里有几个重点。

第一，使用的是：

```xml
PointerPressed="Row_PointerPressed"
```

而不是 WPF 里常见的：

```xml
MouseDoubleClick="..."
```

在 Avalonia 中，推荐使用指针事件体系。

第二，判断双击时使用：

```csharp
e.ClickCount == 2
```

第三，`Background="Transparent"` 很重要。

在 Avalonia 里，如果某个区域完全没有背景，有时候空白区域可能不会参与 [[HitTest]]。设置透明背景可以让整块区域都能响应指针事件。

第四，`Tag` 放在 `Border` 上，而不是直接放在 `TextBlock` 上。

因为用户点到的源头可能是 `TextBlock`，也可能是内部视觉元素。把标记放在单元格容器上，再从事件源向上查找，会更稳定。

### ✦ Code-Behind 处理逻辑 (Code-Behind Handling)

```csharp
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.VisualTree;

private void Row_PointerPressed(object? sender, PointerPressedEventArgs e)
{
    if (sender is not Control row)
        return;

    // 只处理左键双击
    var point = e.GetCurrentPoint(row);

    if (point.Properties.PointerUpdateKind != PointerUpdateKind.LeftButtonPressed)
        return;

    if (e.ClickCount != 2)
        return;

    // 当前行数据
    if (row.DataContext is not UserModel rowData)
        return;

    // 从事件源向上查找带 Tag 的单元格容器
    var cell = FindTaggedControl(e.Source);

    if (cell?.Tag is not string columnKey)
        return;

    switch (columnKey)
    {
        case "Column_Name":
            // 进入姓名编辑模式
            EnterNameEditMode(rowData);
            e.Handled = true;
            break;

        case "Column_Age":
            // 进入年龄编辑模式
            EnterAgeEditMode(rowData);
            e.Handled = true;
            break;
    }
}

private static Control? FindTaggedControl(object? source)
{
    var current = source as Control;

    while (current is not null)
    {
        if (current.Tag is not null)
            return current;

        current = current.GetVisualParent() as Control;
    }

    return null;
}
```

这个写法比直接判断 `e.Source` 更可靠。

不要写成这样：

```csharp
if (e.Source is Control control && control.Tag is string tag)
{
    // ...
}
```

因为 `e.Source` 可能不是你真正打 `Tag` 的那个控件。

比如你点击姓名文本时，事件源可能是：

```text
TextBlock
```

而真正带有 `Tag="Column_Name"` 的是外层：

```text
Border
```

所以正确做法是：

> 从 `e.Source` 开始，沿着 [[VisualTree]] 向上找，直到找到带标记的控件。

这就是 Avalonia 里处理复杂模板、复杂单元格、复杂列表交互时非常常见的技巧。

### ✦ 为什么不用单独事件？ (Why Not Individual Events?)

你当然可以这样写：

```xml
<TextBlock PointerPressed="Name_PointerPressed" />
<TextBlock PointerPressed="Age_PointerPressed" />
```

小项目没问题。

但当列越来越多、模板越来越复杂时，这种方式会带来几个问题：

- 事件分散；
- 重复代码多；
- 改交互规则时要改很多地方；
- 列表动态变化时维护成本更高；
- 复杂控件模板中很难确认真正触发源。

而 [[Bubble]] 事件的优势在于：

> 子元素只负责展示，父级容器统一判断交互意图。

这就是 [[EventDelegation]] 思想在 Avalonia 中的应用。

---

## ✦ 场景二：隧道事件——输入拦截的"安检门" (Tunnel Events: Input Interception)

在 WPF 中，你可能会写：

```xml
<TextBox PreviewTextInput="..." />
```

但在 Avalonia 中，不应该照搬这个思路。

Avalonia 更常见的做法是使用 `AddHandler` 明确指定监听 [[Tunnel]] 阶段。

假设你要做一个只能输入纯数字的文本框。

### ✦ XAML 定义

```xml
<TextBox x:Name="NumberBox"
         Watermark="只能输入数字" />
```

### ✦ Code-Behind 实现

```csharp
using System.Text.RegularExpressions;
using Avalonia.Input;
using Avalonia.Interactivity;

public partial class MainView : UserControl
{
    private static readonly Regex NumberRegex = new("^[0-9]+$", RegexOptions.Compiled);

    public MainView()
    {
        InitializeComponent();

        NumberBox.AddHandler(
            InputElement.TextInputEvent,
            NumberBox_TextInputTunnel,
            RoutingStrategies.Tunnel);
    }

    private void NumberBox_TextInputTunnel(object? sender, TextInputEventArgs e)
    {
        if (string.IsNullOrEmpty(e.Text))
            return;

        if (!NumberRegex.IsMatch(e.Text))
        {
            e.Handled = true;
        }
    }
}
```

这里的核心是：

```csharp
RoutingStrategies.Tunnel
```

这表示我们在 [[Tunnel]] 阶段处理 `TextInput` 事件。

也就是说，事件会先从外层往内层走。在文本真正进入 `TextBox` 之前，我们就有机会判断它是否合法。

如果发现输入不是数字：

```csharp
e.Handled = true;
```

那么普通的后续处理器通常就不会继续处理这个输入，从而达到拦截效果。

### ✦ Handled 属性深度解析 (Understanding Handled)

从业务理解上，你可以把它看成"拦截"。

但严格来说，它不是绝对意义上的"事件彻底消失"。

在 Avalonia 中，如果事件被设置为：

```csharp
e.Handled = true;
```

通常意味着：

- 后续普通事件处理器不会再收到它；
- 控件默认处理逻辑可能会被阻止；
- 但如果某些处理器通过特殊方式监听已经处理过的事件，仍然可能收到。

比如使用：

```csharp
AddHandler(
    InputElement.PointerPressedEvent,
    Handler,
    RoutingStrategies.Bubble,
    handledEventsToo: true);
```

就可以监听已经被标记为 [[Handled]] 的事件。

所以更严谨的说法是：

> [[Handled]] = true 会阻止普通后续处理流程，是输入拦截的核心手段，但不是让事件在框架内部完全不存在。

### ✦ 数字输入框的生产级提醒 (Production Considerations)

上面的代码适合理解 [[Tunnel]] 事件，但如果你要做一个真正生产可用的数字输入框，仅靠 `TextInput` 还不够。

因为它可能覆盖不了所有输入路径，例如：

- 粘贴；
- 拖拽文本；
- 输入法组合输入；
- 程序直接设置 `TextBox.Text`；
- 绑定回写；
- 小数、负数、千分位等业务规则。

所以真实项目中，建议组合使用：

- `TextInput` 预拦截；
- `TextChanged` 或绑定校验兜底；
- ViewModel 属性校验；
- 自定义控件封装；
- 数据层最终校验。

UI 输入拦截只能提升用户体验，不能替代业务数据校验。

---

## ✦ 场景三：直接事件与样式系统——悬浮变色该不该写事件？ (Direct Events vs Style)

很多新手会写这样的代码：

```csharp
private void Button_PointerEntered(object? sender, PointerEventArgs e)
{
    MyButton.Background = Brushes.Red;
}

private void Button_PointerExited(object? sender, PointerEventArgs e)
{
    MyButton.Background = Brushes.Blue;
}
```

这在技术上能跑，但在 Avalonia 里并不推荐。

因为这只是视觉变化。

视觉变化应该交给 Avalonia 的 [[Selector]] 样式系统，而不是事件。

### ✦ 正确做法：使用 :pointerover (Correct Approach: :pointerover)

Avalonia 的 [[Selector]] 样式系统非常强大。

比如按钮悬浮变色，可以这样写：

```xml
<Button Classes="primary"
        Content="保存" />
```

样式：

```xml
<Style Selector="Button.primary">
    <Setter Property="Background" Value="#2563EB" />
    <Setter Property="Foreground" Value="White" />
</Style>

<Style Selector="Button.primary:pointerover">
    <Setter Property="Background" Value="#1D4ED8" />
</Style>
```

这比事件方式更好：

- 代码更少；
- 结构更清晰；
- 视觉和逻辑分离；
- 更容易复用；
- 更符合 Avalonia 的设计方式；
- 不会把样式逻辑塞进 `.axaml.cs`。

### ✦ 什么时候用 PointerEntered？ (When to Use PointerEntered?)

只有当悬浮行为背后存在真实业务需求时，才应该使用事件。

例如：

- 鼠标悬浮超过 1 秒后请求用户详情；
- 悬浮时开始预加载图片；
- 统计用户在某个区域的停留时间；
- 显示需要复杂计算的浮层；
- 和底层输入设备状态有关的交互。

例如：

```xml
<Border PointerEntered="UserCard_PointerEntered"
        PointerExited="UserCard_PointerExited">
    <!-- 用户卡片内容 -->
</Border>
```

```csharp
private void UserCard_PointerEntered(object? sender, PointerEventArgs e)
{
    // 开始计时，超过一定时间后加载详情
}

private void UserCard_PointerExited(object? sender, PointerEventArgs e)
{
    // 取消计时或关闭浮层
}
```

简单判断标准是：

> 如果只是变色、缩放、动画，用 Style。
> 如果真的要触发业务行为，用 Event。

---

## ✦ 底层关键概念：sender、e.Source 和 Handled (Core Concepts)

### ✦ sender 是什么？ (What is sender?)

在 Avalonia 事件处理器中：

```csharp
private void Row_PointerPressed(object? sender, PointerPressedEventArgs e)
{
}
```

`sender` 通常代表：

> 当前正在执行这个事件处理器的控件。

比如你把事件写在外层 `Grid` 上：

```xml
<Grid PointerPressed="Row_PointerPressed">
```

那么 `sender` 就是这个 `Grid`。

即使你真正点的是里面的 `TextBlock`，`sender` 仍然是挂载处理器的那个 `Grid`。

### ✦ e.Source 是什么？ (What is e.Source?)

`e.Source` 代表：

> 这次路由事件的事件源。

在实际 UI 中，它往往是用户真正命中的那个内部元素，或者由控件系统确定的事件源。

例如你点击下面这个结构里的文字：

```xml
<Border Tag="Column_Name">
    <TextBlock Text="{Binding Name}" />
</Border>
```

`e.Source` 可能是：

```text
TextBlock
```

而不是外层的 `Border`。

所以如果你想知道用户点的是哪一列，不能只判断 `e.Source` 本身，而应该从 `e.Source` 开始向上找。

```csharp
private static Control? FindTaggedControl(object? source)
{
    var current = source as Control;

    while (current is not null)
    {
        if (current.Tag is not null)
            return current;

        current = current.GetVisualParent() as Control;
    }

    return null;
}
```

这就是 Avalonia 中处理 [[RoutingEvent]] 时非常重要的思维：

> 事件源不一定就是你的业务目标控件。
> 你经常需要沿 [[VisualTree]] 向上寻找真正有业务含义的元素。

### ✦ Handled 是什么？ (What is Handled?)

[[Handled]] 用来告诉事件系统：

> 这个事件我已经处理过了，后面的普通处理器可以不用管了。

例如：

```csharp
e.Handled = true;
```

常见用途包括：

- 阻止非法输入；
- 阻止事件继续冒泡；
- 防止父控件重复响应；
- 阻止默认行为；
- 明确某个交互已经被当前控件消费。

但是要注意：

如果其他地方使用了：

```csharp
handledEventsToo: true
```

那么即使事件已经被标记为 [[Handled]]，它仍然可以被监听到。

---

## ✦ MVVM 架构下，Code-Behind 是不是原罪？ (Is Code-Behind a Sin in MVVM?)

这是很多 Avalonia 开发者都会纠结的问题。

有人认为：

> 只要 `.axaml.cs` 里出现一行事件代码，就说明 [[MVVM]] 不纯。

这个观点太绝对了。

[[MVVM]] 的核心目标不是消灭 [[Code-Behind]]，而是分离职责。

你要区分两类逻辑：

### ✦ UI 物理交互逻辑 (UI Physical Interaction Logic)

这类逻辑和界面强相关。

例如：

- 鼠标点击位置；
- 指针进入、离开；
- 焦点控制；
- 拖拽过程；
- [[HitTest]]；
- 动画播放；
- 控件内部状态切换；
- 根据 [[VisualTree]] 查找父级控件；
- 自定义控件内部交互。

这些东西本质上属于 View 层。

它们可以写在 [[Code-Behind]]，尤其是在自定义控件、复杂视图、交互组件中。

你没有必要把这些东西强行塞进 ViewModel。

如果 ViewModel 里出现了大量：

- `PointerEventArgs`；
- `Control`；
- `TextBox`；
- `Visual`；
- `GetVisualParent()`；
- 坐标计算；
- 焦点对象；

那反而说明你的 ViewModel 被 UI 框架污染了。

### ✦ 核心业务逻辑 (Core Business Logic)

这类逻辑应该放到 ViewModel 或服务层。

例如：

- 保存用户；
- 删除数据；
- 请求接口；
- 切换页面；
- 提交订单；
- 修改业务状态；
- 数据校验；
- 权限判断。

这些不应该直接写在事件处理器里。

例如按钮保存，推荐这样写：

```xml
<Button Content="保存"
        Command="{Binding SaveCommand}" />
```

而不是：

```xml
<Button Content="保存"
        Click="SaveButton_Click" />
```

如果事件中确实捕获到了 UI 信息，也应该尽快转换成业务语义，然后交给 ViewModel。

例如：

```csharp
private void Row_PointerPressed(object? sender, PointerPressedEventArgs e)
{
    // UI 层负责判断用户双击了哪一列
    // 然后调用 ViewModel 的语义方法或命令

    if (DataContext is UserListViewModel vm)
    {
        vm.BeginEditCell(rowData, columnKey);
    }
}
```

注意这里传给 ViewModel 的不是 `PointerPressedEventArgs`，而是更干净的业务参数：

```csharp
rowData
columnKey
```

这就比把整个事件参数丢进 ViewModel 更合理。

---

## ✦ 事件和 Command 如何取舍？ (Events vs Commands)

可以用一个简单原则判断：

### ✦ 用户意图明确，属于业务动作：用 Command (Business Intent: Use Command)

例如：

```xml
<Button Content="删除"
        Command="{Binding DeleteUserCommand}"
        CommandParameter="{Binding}" />
```

适合：

- 保存；
- 删除；
- 查询；
- 登录；
- 导航；
- 提交；
- 导出；
- 刷新。

这类动作不关心鼠标具体点在哪里，也不关心 [[VisualTree]] 结构。

它只关心用户触发了某个业务意图。

所以用 Command。

### ✦ 需要 UI 命中、坐标、焦点、视觉树：用 Event (UI-dependent: Use Event)

例如：

- 双击某个单元格；
- 判断点的是哪一列；
- 拖拽排序；
- 框选区域；
- 右键弹出菜单位置；
- 自定义控件内部交互。

这类逻辑依赖 UI 框架本身。

用事件更自然。

### ✦ 灰色地带：可以用 Behavior 转 Command (Gray Area: Behavior to Command)

有些时候，你既需要监听事件，又想保持 ViewModel 的命令风格。

这时可以考虑 Avalonia 的行为库，例如：

- `Avalonia.Xaml.Behaviors`
- `Avalonia.Xaml.Interactions`

把事件转换成 Command。

但要注意：

> 不要为了追求"纯 MVVM"，把大量 UI 框架事件参数传进 ViewModel。

更好的方式是传递业务参数，而不是传递 UI 对象。

---

## ✦ 路由思想在 MVVM 中的高级应用：动态导航栏 (Advanced: Dynamic Navigation Bar)

理解 [[RoutingEvent]] 以后，你会发现一个更重要的思想：

> 不要让每个子元素各自为战，而要找到更高层的统一抽象。

这不仅适用于事件，也适用于 [[MVVM]]。

比如你要做一个侧边导航栏。

低级但常见的做法是：

```xml
<Button Content="首页" Command="{Binding GoHomeCommand}" />
<Button Content="用户" Command="{Binding GoUserCommand}" />
<Button Content="设置" Command="{Binding GoSettingsCommand}" />
```

这不是不能用。

但如果导航项是动态的、可配置的、有选中状态的，那么更自然的做法是使用 `ListBox`。

因为导航栏本质上就是：

> 一组选项里选中一个。

这和 `ListBox.SelectedItem` 的语义完全一致。

### ✦ XAML 实现

```xml
<ListBox ItemsSource="{Binding NavItems}"
         SelectedItem="{Binding SelectedNavItem, Mode=TwoWay}">
    <ListBox.ItemTemplate>
        <DataTemplate>
            <StackPanel Orientation="Horizontal"
                        Spacing="8">
                <PathIcon Data="{Binding Icon}" />
                <TextBlock Text="{Binding Name}" />
            </StackPanel>
        </DataTemplate>
    </ListBox.ItemTemplate>
</ListBox>
```

这里没有写任何 Click 事件。

也没有给每个按钮单独绑定 Command。

用户点击哪个导航项，Avalonia 内部会通过控件自身的输入事件和选择机制更新 `SelectedItem`。

ViewModel 只关心：

```csharp
SelectedNavItem
```

发生了变化。

### ✦ ViewModel 实现

```csharp
private NavItemModel? _selectedNavItem;

public NavItemModel? SelectedNavItem
{
    get => _selectedNavItem;
    set
    {
        if (SetProperty(ref _selectedNavItem, value) && value is not null)
        {
            NavigateToPage(value.PageType);
        }
    }
}
```

这就是 [[MVVM]] 最舒服的地方。

UI 层负责处理：

- 鼠标点击；
- [[HitTest]]；
- 选中状态；
- 样式变化；
- 高亮显示。

ViewModel 只负责处理：

- 当前选中了谁；
- 应该导航到哪里；
- 当前业务状态如何变化。

你没有直接操作按钮，也没有在每个按钮上写事件。

整个导航栏变成了一个数据驱动的状态模型。

---

## ✦ Command 不是低级做法 (Commands Are Not Low-level)

需要强调一下：

给按钮绑定 Command 并不低级。

比如：

```xml
<Button Content="进入"
        Command="{Binding DataContext.NavigateCommand,
                          RelativeSource={RelativeSource AncestorType=ListBox}}"
        CommandParameter="{Binding}" />
```

这仍然是非常标准的 [[MVVM]] 写法。

只是对于"侧边导航栏"这种具有单选状态的场景来说，用 `ListBox.SelectedItem` 更贴合控件语义。

所以更准确的说法是：

> 如果交互本质是一个业务动作，用 Command。
> 如果交互本质是一个选择状态，用 SelectedItem。
> 如果交互本质是 UI 物理行为，用 Event。
> 如果交互本质是视觉变化，用 Style。

---

## ✦ 最终总结 (Final Summary)

Avalonia 的 [[RoutingEvent]] 不是多余设计，它是现代 XAML UI 框架处理复杂界面交互的基础。

你需要记住几个核心点：

### ✦ 核心要点 (Key Takeaways)

#### 1. Avalonia 以 Pointer 事件为主

不要在 Avalonia 中直接照搬 WPF 的 `MouseDoubleClick`。

双击常见写法是：

```csharp
PointerPressed + e.ClickCount
```

#### 2. Avalonia 没有大量 `PreviewXXX` 事件

想监听预处理阶段，使用：

```csharp
AddHandler(..., RoutingStrategies.Tunnel)
```

#### 3. Avalonia 中常用 `e.Source`

不要照搬 WPF 的：

```csharp
e.OriginalSource
```

在 Avalonia 中，通常使用：

```csharp
e.Source
```

并且要从 `Source` 开始沿 [[VisualTree]] 向上查找真正有业务意义的控件。

#### 4. Handled = true 是事件拦截的核心

它可以阻止普通后续处理器继续处理事件，但不是让事件在框架内部彻底消失。

必要时仍可以通过：

```csharp
handledEventsToo: true
```

监听已处理事件。

#### 5. Code-Behind 不是原罪

真正的问题不是有没有 [[Code-Behind]]，而是你把什么东西写进了 [[Code-Behind]]。

合理分工应该是：

```text
Style       -> 视觉表现
Event       -> UI 物理交互
Command     -> 用户业务意图
ViewModel   -> 状态与业务逻辑
Service     -> 外部资源和核心服务
```

最后用一句话收尾：

> 成熟的 Avalonia 开发者，不是从不写事件，而是知道什么该写成事件，什么该写成样式，什么该交给 Command，什么必须沉淀到 ViewModel。
