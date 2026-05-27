---
title: 'Record: C# 中为数据而生的超级语法糖'
cover: /img/bg/record-cover.webp
abbrlink: xept4sui
date: 2026-05-27 21:55:12
categories:
  - .NET
tags:
  - CSharp
  - 数据建模
  - 函数式编程
glossary:
  record:
    title: record
    brief: C# 9+ 引入的数据载体类型，编译器自动生成值相等性、ToString 等样板代码
  record-class:
    title: record class
    brief: 分配在托管堆上的引用类型 record，默认不可变，支持继承与多态
  record-struct:
    title: record struct
    brief: 分配在栈上的值类型 record，默认可变，适合高频创建的轻量数据
  positional-syntax:
    title: 位置语法（Positional Syntax）
    brief: 用一行括号参数定义 record 属性与构造函数的极简写法
  with-expression:
    title: with 表达式
    brief: 基于现有 record 实例拷贝并修改部分属性，生成新实例的非破坏性突变机制
  value-equality:
    title: 值相等性（Value Equality）
    brief: 两个对象内部数据相同即判定为相等，无需手动重写 Equals 与 GetHashCode
  reference-equality:
    title: 引用相等性（Reference Equality）
    brief: 默认 class 行为，仅当两个变量指向同一内存地址时才返回 true
  init-only:
    title: init-only
    brief: 属性仅在对象初始化阶段可赋值，构造完成后锁定为只读
  dto:
    title: DTO（Data Transfer Object）
    brief: 纯粹用于在层级间搬运数据的哑对象，不承载业务逻辑
  gc:
    title: GC（Garbage Collection）
    brief: .NET 运行时的自动内存回收机制，堆分配对象由 GC 托管生命周期
---

## ✦ 为什么需要 Record

在 [[record]] 登场之前，C# 开发者定义一个纯数据载体（比如 [[dto]]、配置项、DDD 值对象）时，面临一个尴尬的现实：[[reference-equality]] 是默认行为。

两个对象哪怕每个字段都一模一样，只要它们在堆上的地址不同，`==` 就返回 `false`。为了实现「数据相同即相等」，你必须手动重写 `Equals()`、`GetHashCode()`、`==` 和 `!=` 操作符——繁琐、易错、毫无技术含量。

[[record]] 的诞生就是为了一劳永逸地干掉这套样板代码。

## ✦ Record 的本质

[[record]] 本质上依然是 `class` 或 `struct`，但编译器会在 IL 层面自动为你生成：

- 基于所有公共属性的 [[value-equality]]
- `GetHashCode()` 的正确重写
- 一个 JSON 风格的 `ToString()` 重写
- 用于 [[with-expression]] 的克隆方法

你写的是一行声明，编译器产出的是一个功能完备的数据类型。

## ✦ record class vs record struct

### ✦ record class（引用类型）

```csharp
public record User(string Name, int Age);
```

- 分配在**托管堆**上，受 [[gc]] 管理
- 使用 [[positional-syntax]] 时，属性默认是 [[init-only]]（只读）
- 支持继承，可以参与多态
- 适合场景：数据体量较大、生命周期较长、需要序列化传输的对象

### ✦ record struct（值类型）

```csharp
public readonly record struct Point(int X, int Y);
```

- 分配在**栈**上，不受 GC 扫描
- 使用 [[positional-syntax]] 时，属性默认是 `get/set`（可读可写）
- **强烈建议永远写成 `readonly record struct`**——可变的值类型在集合或字典中修改属性时极易引发隐蔽 Bug
- 适合场景：坐标点、游戏数学向量、金融高频交易中需要 Zero-Allocation 的极端场景

## ✦ 四大核心特性

### ✦ 一行定义（位置语法）

```csharp
// 传统 class 需要：字段 + 属性 + 构造函数 + Equals + GetHashCode
// record 只需一行
public record User(string Name, int Age);
public readonly record struct Point(int X, int Y);
```

编译器自动生成带参构造函数和只读属性。

### ✦ 开箱即用的值相等性

```csharp
var a = new User("Alice", 25);
var b = new User("Alice", 25);

Console.WriteLine(a == b); // True —— 数据相同，对象即相等
```

[[value-equality]] 是 [[record]] 的默认行为，无需任何额外代码。

### ✦ 非破坏性突变（with 表达式）

```csharp
var user1 = new User("Alice", 25);
var user2 = user1 with { Age = 26 };

Console.WriteLine(user1.Age); // 25 —— 原对象未被破坏
Console.WriteLine(user2.Age); // 26 —— 新对象携带修改
```

[[with-expression]] 在函数式编程和不可变数据流中极其常用：你永远不修改原始数据，而是基于它派生新版本。

### ✦ 自动格式化输出

```csharp
var user = new User("Bob", 30);
Console.WriteLine(user.ToString());
// 输出: User { Name = Bob, Age = 30 }
```

调试时直接打印对象就能看到所有字段值，省去手动重写 `ToString()` 的功夫。

## ✦ 实践决策树

**用 `record` 还是 `class`？**

- 对象的核心职责是**装载数据**，且经常需要比较或拷贝 → 无脑 `record`
- 对象的核心职责是**封装行为与状态**（Service、Manager、Controller）→ 传统 `class`

**用 `record class` 还是 `record struct`？**

- **90% 的业务场景** → 直接 `record class`（简写 `record`），现代 GC 完全兜得住
- **极端性能场景**（游戏引擎、高频交易、底层框架）→ `readonly record struct`，追求 Zero-Allocation

**record struct 防坑指南**

永远写成 `readonly record struct`。可变值类型在 C# 中是公认的陷阱源——你以为修改了字典里的结构体，实际上修改的是栈上的副本。

## ✦ 底层逻辑

[[record]] 的魔法并非运行时黑科技，而是编译器在编译期完成的代码生成。当你写下 `public record User(string Name, int Age);`，编译器实际生成了：

1. 一个带有 `Name` 和 `Age` 属性的类
2. 一个接受 `string name, int age` 参数的主构造函数
3. 重写的 `Equals(object)` 和 `Equals(User)` 方法
4. 重写的 `GetHashCode()` 方法
5. 重写的 `ToString()` 方法
6. 一个 `<Clone>$()` 方法供 [[with-expression]] 使用
7. 一个 `IEquatable<User>` 接口实现

这一切都在 IL 层面静默完成，你无需看见，也无需维护。
