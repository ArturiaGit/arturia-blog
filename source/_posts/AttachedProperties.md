---
title: 'AttachedProperties: Avalonia 附加属性完全指南'
cover: /img/bg/attachedproperties-cover.webp
abbrlink: v5a1uhrf
date: 2026-05-04 15:10:44
categories:
  - Avalonia
tags:
  - Avalonia
  - CSharp
  - XAML
  - AttachedProperties
  - UI
glossary:
  属性:
    title: 属性
    brief: 面向对象编程中用于描述对象状态的成员,可读写数据
  附加属性:
    title: 附加属性
    brief: 定义在一个类上但可附加到任意控件上的属性机制
  底层逻辑:
    title: 底层逻辑
    brief: 框架或系统内部的核心运行原理与设计决策
  事件:
    title: 事件
    brief: 对象状态变化时发出的通知,用于解耦组件间的通信
  内存泄漏:
    title: 内存泄漏
    brief: 已分配内存因引用未释放而无法被 GC 回收的现象
  AvaloniaProperty:
    title: AvaloniaProperty
    brief: Avalonia 属性系统的核心基类,所有附加属性和依赖属性的注册入口
  RegisterAttached:
    title: RegisterAttached
    brief: 静态方法,用于注册一个新的附加属性定义
  AvaloniaObject:
    title: AvaloniaObject
    brief: Avalonia 对象模型的根基类,提供属性系统和生命周期管理
  ICommand:
    title: ICommand
    brief: .NET 命令接口,MVVM 模式中实现命令绑定的核心抽象
  PropertyChanged:
    title: 属性变化通知
    brief: 属性值变更时触发的回调机制,用于响应式更新
  Adorner:
    title: 装饰器
    brief: 叠加在控件视觉层之上的轻量级装饰元素,用于水印等效果
  VisualTree:
    title: 视觉树
    brief: 控件在渲染阶段形成的层级结构,附加属性在此阶段生效
  EventTriggerBehavior:
    title: EventTriggerBehavior
    brief: 行为库中的事件触发器,将 UI 事件桥接到 MVVM 命令
  MultiBinding:
    title: MultiBinding
    brief: 多源绑定,将多个属性值聚合后传递给目标
---

在 Avalonia 的数字领地中，控件的状态管理是核心命题。普通[[属性]]属于控件自身，而[[附加属性]]打破了这一边界——它定义在一个类上，却可以附加到任何控件上。这种机制是框架[[底层逻辑]]的优雅体现，也是实现关注点分离的关键。

理解[[附加属性]]的工作原理，是从"会用控件"迈向"能扩展控件"的分水岭。本文将从注册机制、内置模式到工程实战，系统拆解这一核心扩展机制。

## ✦ 附加属性的本质

普通[[属性]]是"我自己的东西"，[[附加属性]]是"别人的东西，但挂在我身上"。

```xml
<!-- 普通属性：Text 属于 TextBox 自身 -->
<TextBox Text="Hello" />

<!-- 附加属性：Grid.Row 是 Grid 定义的，但设置在 TextBlock 上 -->
<TextBlock Grid.Row="1" Text="Hello" />
```

Grid 说：我定义了一个 Row 属性，谁被放进我里面，谁就可以设置它。这种设计使得布局容器能为子元素注入布局参数，而无需修改子元素本身。

## ✦ 内置附加属性：框架中的常见模式

Avalonia 内置了多个布局容器，它们通过[[附加属性]]实现布局控制：

```xml
<!-- Grid 定义的 -->
<StackPanel Grid.Row="1" Grid.Column="2">

<!-- DockPanel 定义的 -->
<Button DockPanel.Dock="Top">

<!-- Canvas 定义的 -->
<Rectangle Canvas.Left="10" Canvas.Top="20">

<!-- ToolTip 定义的 -->
<Button ToolTip.Tip="点击提交">
```

这些属性的共同点：定义在 A 类上，却设置在任何 B 控件上。这是 Avalonia 布局系统的基石模式。

## ✦ 自定义附加属性：从注册到使用

### 基本结构

自定义[[附加属性]]需要三个部分：注册、静态 Getter、静态 Setter。

```csharp
public static class MyAttachedProperties
{
    // ① 注册附加属性
    public static readonly AttachedProperty<string?> HintProperty =
        AvaloniaProperty.RegisterAttached<MyAttachedProperties, Control, string?>(
            "Hint",              // 属性名
            typeof(MyAttachedProperties),  // 所有者类型
            null                 // 默认值
        );

    // ② 静态 Getter
    public static string? GetHint(Control element)
    {
        return element.GetValue(HintProperty);
    }

    // ③ 静态 Setter
    public static void SetHint(Control element, string? value)
    {
        element.SetValue(HintProperty, value);
    }
}
```

### 泛型参数解析

注册方法的三个泛型参数决定了属性的宿主和类型：

```csharp
AvaloniaProperty.RegisterAttached<
    TOwner,       // 定义这个属性的类（通常是静态工具类）
    THost,        // 这个属性可以附加到哪种控件上
    TValue        // 属性值的类型
>
```

```csharp
// 示例：只能附加到 TextBox 上，值是 bool
public static readonly AttachedProperty<bool> IsNumericProperty =
    AvaloniaProperty.RegisterAttached<MyProps, TextBox, bool>("IsNumeric", ...);

// 示例：可以附加到任何 Control 上，值是 string
public static readonly AttachedProperty<string?> HintProperty =
    AvaloniaProperty.RegisterAttached<MyProps, Control, string?>("Hint", ...);

// 示例：可以附加到任何 AvaloniaObject 上，值是 ICommand
public static readonly AttachedProperty<ICommand?> CommandProperty =
    AvaloniaProperty.RegisterAttached<MyProps, AvaloniaObject, ICommand?>("Command", ...);
```

## ✦ 实战场景：附加属性的工程化应用

### 场景一：水印提示（Watermark）

为任意 TextBox 添加水印，无需继承控件：

```csharp
public static class WatermarkBehavior
{
    public static readonly AttachedProperty<string?> WatermarkProperty =
        AvaloniaProperty.RegisterAttached<WatermarkBehavior, TextBox, string?>(
            "Watermark", typeof(WatermarkBehavior), null);

    public static string? GetWatermark(TextBox element) => element.GetValue(WatermarkProperty);
    public static void SetWatermark(TextBox element, string? value) => element.SetValue(WatermarkProperty, value);

    static WatermarkBehavior()
    {
        WatermarkProperty.Changed.AddClassHandler<TextBox>((textBox, e) =>
        {
            if (e.NewValue is string watermark)
            {
                textBox.AttachedToVisualTree += (_, _) =>
                {
                    UpdateWatermark(textBox, watermark);
                };

                textBox.PropertyChanged += (_, pe) =>
                {
                    if (pe.Property == TextBox.TextProperty)
                    {
                        UpdateWatermark(textBox, watermark);
                    }
                };
            }
        });
    }

    private static void UpdateWatermark(TextBox textBox, string watermark)
    {
        // 实际水印实现可能用 [[Adorner]] 或自定义控件
    }
}
```

```xml
<TextBox local:WatermarkBehavior.Watermark="请输入用户名" />
<TextBox local:WatermarkBehavior.Watermark="请输入密码" />
```

### 场景二：数字输入限制（Input Restriction）

限制输入内容为纯数字：

```csharp
public static class InputRestrictionBehavior
{
    public static readonly AttachedProperty<bool> IsNumericOnlyProperty =
        AvaloniaProperty.RegisterAttached<InputRestrictionBehavior, TextBox, bool>(
            "IsNumericOnly", typeof(InputRestrictionBehavior), false);

    public static bool GetIsNumericOnly(TextBox element) => element.GetValue(IsNumericOnlyProperty);
    public static void SetIsNumericOnly(TextBox element, bool value) => element.SetValue(IsNumericOnlyProperty, value);

    static InputRestrictionBehavior()
    {
        IsNumericOnlyProperty.Changed.AddClassHandler<TextBox>((textBox, e) =>
        {
            if (e.NewValue is true)
            {
                textBox.TextInput += OnTextInput;
                textBox.PastingFromClipboard += OnPaste;
            }
            else
            {
                textBox.TextInput -= OnTextInput;
                textBox.PastingFromClipboard -= OnPaste;
            }
        });
    }

    private static void OnTextInput(object? sender, TextInputEventArgs e)
    {
        if (!string.IsNullOrEmpty(e.Text) && !e.Text.All(char.IsDigit))
        {
            e.Handled = true;
        }
    }

    private static async void OnPaste(object? sender, RoutedEventArgs e)
    {
        if (sender is TextBox textBox)
        {
            var clipboard = TopLevel.GetTopLevel(textBox)?.Clipboard;
            var text = await clipboard?.GetTextAsync();
            if (text != null && !text.All(char.IsDigit))
            {
                e.Handled = true;
            }
        }
    }
}
```

```xml
<!-- 只允许输入数字 -->
<TextBox local:InputRestrictionBehavior.IsNumericOnly="True"
         Watermark="请输入年龄" />

<!-- 正常 TextBox，不限制 -->
<TextBox Watermark="请输入姓名" />
```

### 场景三：自动聚焦（Auto Focus）

页面加载后自动聚焦到指定控件：

```csharp
public static class AutoFocusBehavior
{
    public static readonly AttachedProperty<bool> IsAutoFocusProperty =
        AvaloniaProperty.RegisterAttached<AutoFocusBehavior, Control, bool>(
            "IsAutoFocus", typeof(AutoFocusBehavior), false);

    public static bool GetIsAutoFocus(Control element) => element.GetValue(IsAutoFocusProperty);
    public static void SetIsAutoFocus(Control element, bool value) => element.SetValue(IsAutoFocusProperty, value);

    static AutoFocusBehavior()
    {
        IsAutoFocusProperty.Changed.AddClassHandler<Control>((control, e) =>
        {
            if (e.NewValue is true)
            {
                control.AttachedToVisualTree += (_, _) =>
                {
                    control.Focus();
                };
            }
        });
    }
}
```

```xml
<!-- 页面加载后自动聚焦到搜索框 -->
<TextBox local:AutoFocusBehavior.IsAutoFocus="True"
         Watermark="搜索..." />
```

### 场景四：拖拽支持（Drag & Drop）

为任意控件添加拖拽功能：

```csharp
public static class DragDropBehavior
{
    public static readonly AttachedProperty<bool> AllowDropProperty =
        AvaloniaProperty.RegisterAttached<DragDropBehavior, Control, bool>(
            "AllowDrop", typeof(DragDropBehavior), false);

    public static readonly AttachedProperty<ICommand?> DropCommandProperty =
        AvaloniaProperty.RegisterAttached<DragDropBehavior, Control, ICommand?>(
            "DropCommand", typeof(DragDropBehavior), null);

    public static bool GetAllowDrop(Control element) => element.GetValue(AllowDropProperty);
    public static void SetAllowDrop(Control element, bool value) => element.SetValue(AllowDropProperty, value);
    public static ICommand? GetDropCommand(Control element) => element.GetValue(DropCommandProperty);
    public static void SetDropCommand(Control element, ICommand? value) => element.SetValue(DropCommandProperty, value);

    static DragDropBehavior()
    {
        AllowDropProperty.Changed.AddClassHandler<Control>((control, e) =>
        {
            if (e.NewValue is true)
            {
                DragDrop.SetAllowDrop(control, true);
                control.AddHandler(DragDrop.DropEvent, OnDrop);
            }
            else
            {
                DragDrop.SetAllowDrop(control, false);
                control.RemoveHandler(DragDrop.DropEvent, OnDrop);
            }
        });
    }

    private static void OnDrop(object? sender, DragEventArgs e)
    {
        if (sender is Control control)
        {
            var command = GetDropCommand(control);
            var files = e.Data.GetFiles();
            if (command?.CanExecute(files) == true)
            {
                command.Execute(files);
            }
        }
    }
}
```

```xml
<ListBox local:DragDropBehavior.AllowDrop="True"
         local:DragDropBehavior.DropCommand="{Binding HandleDropCommand}">
    <!-- 拖入文件时执行 HandleDropCommand -->
</ListBox>
```

### 场景五：防重复点击（Throttle Click）

防止按钮被快速重复点击：

```csharp
public static class ThrottleClickBehavior
{
    public static readonly AttachedProperty<int> ThrottleMsProperty =
        AvaloniaProperty.RegisterAttached<ThrottleClickBehavior, Button, int>(
            "ThrottleMs", typeof(ThrottleClickBehavior), 0);

    public static int GetThrottleMs(Button element) => element.GetValue(ThrottleMsProperty);
    public static void SetThrottleMs(Button element, int value) => element.SetValue(ThrottleMsProperty, value);

    static ThrottleClickBehavior()
    {
        ThrottleMsProperty.Changed.AddClassHandler<Button>((button, e) =>
        {
            if (e.NewValue is > 0)
            {
                button.Click += OnThrottledClick;
            }
        });
    }

    private static void OnThrottledClick(object? sender, RoutedEventArgs e)
    {
        if (sender is Button button)
        {
            var ms = GetThrottleMs(button);
            button.IsEnabled = false;

            Task.Delay(ms).ContinueWith(_ =>
            {
                Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                {
                    button.IsEnabled = true;
                });
            });
        }
    }
}
```

```xml
<!-- 提交按钮，点击后 2 秒内不可再次点击 -->
<Button Content="提交订单"
        Command="{Binding SubmitCommand}"
        local:ThrottleClickBehavior.ThrottleMs="2000" />
```

### 场景六：纯数据附加（Tag）

仅存储数据，不涉及行为：

```csharp
public static class TagProperty
{
    public static readonly AttachedProperty<object?> TagProperty_ =
        AvaloniaProperty.RegisterAttached<TagProperty, Control, object?>(
            "Tag", typeof(TagProperty), null);

    public static object? GetTag(Control element) => element.GetValue(TagProperty_);
    public static void SetTag(Control element, object? value) => element.SetValue(TagProperty_, value);
}
```

```xml
<!-- 给每个按钮存一个标识 -->
<Button Content="删除" local:TagProperty.Tag="Delete" />
<Button Content="编辑" local:TagProperty.Tag="Edit" />
```

## ✦ 生命周期管理：避免内存泄漏

附加属性最常见的陷阱是[[事件]]订阅未取消，导致[[内存泄漏]]。正确的做法是在[[PropertyChanged]]回调中根据新旧值管理订阅。

```csharp
static MyBehavior()
{
    SomeProperty.Changed.AddClassHandler<Control>((control, e) =>
    {
        // ✅ 好的做法：根据新旧值决定订阅/取消
        if (e.OldValue is string oldVal)
        {
            control.SomeEvent -= Handler;  // 取消旧订阅
        }

        if (e.NewValue is string newVal)
        {
            control.SomeEvent += Handler;  // 注册新订阅
        }
    });
}
```

属性值变化流程：

```
初始 null          →  "hello"      注册事件
"hello"            →  "world"      先取消旧的，再注册新的
"world"            →  null          取消事件（清理）
控件被销毁         →  GC 回收       如果没取消订阅，可能泄漏！
```

## ✦ 总结速查表

| 场景 | 推荐方案 |
|------|----------|
| 简单的"挂数据" | 纯附加属性，不监听 Changed |
| 页面加载触发命令 | 原生附加属性或 Behaviors 包 |
| 事件→命令（通用） | `EventTriggerBehavior` + `InvokeCommandAction` |
| 复杂交互（拖拽/手势） | 原生附加属性 + `Changed` 回调 |
| 需要 `MultiBinding` 传参 | Behaviors 包更方便 |
| 限制控件行为（只允许数字等） | 原生附加属性最合适 |

[[附加属性]]是 Avalonia 中非常核心的扩展机制，掌握了它，你就能给任何控件"赋能"，而不需要继承或修改控件源码。这是数字领地中实现灵活架构的关键一环。
