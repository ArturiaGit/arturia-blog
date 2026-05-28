---
title: 'Record2: 从 record 的 with 表达式一路追到函数式编程的底层逻辑'
cover: /img/bg/record2-cover.webp
abbrlink: k7m2x9q4
date: 2026-05-28 13:45:13
categories:
  - .NET
tags:
  - CSharp
  - 函数式编程
  - Record
glossary:
  record-struct:
    title: record struct
    brief: C# 10 引入的值类型 record，兼具 struct 的栈分配与 record 的不可变语义
  with:
    title: with 表达式
    brief: 非破坏性修改语法糖，基于现有对象生成新副本，仅覆盖指定属性
  pure-function:
    title: 纯函数
    brief: 相同输入永远相同输出，不依赖也不修改外部状态的函数
  immutability:
    title: 不可变性
    brief: 数据一旦创建就不允许修改，想改就生成新副本
  functional-programming:
    title: 函数式编程
    brief: 以纯函数、不可变数据、声明式风格为核心的编程范式
  chaining:
    title: 链式编程
    brief: 方法返回对象自身或新对象，使调用可用点号串联的编码风格
  delegate:
    title: 委托
    brief: C# 中类型安全的函数指针，是 Func 和 Action 的底层支撑
  result-t:
    title: Result<T>
    brief: 用包装对象承载成功或失败，替代异常流控制的函数式错误处理模式
  pattern-matching:
    title: 模式匹配
    brief: C# 7+ 引入的语法扩展，用 is/switch 表达式做类型判断与解构
---

准备 C# 面试时，我复习到 `struct`，顺手查了下 C# 10 的 [[record-struct]]。结果这一查，从 `record` 的 [[with]] 关键字一路追到了函数式编程，最后还搞明白了链式编程和函数式编程到底是什么关系。

## ✦ record 和 with 表达式

`record` 类型有个特点：属性默认是只读的，修改时得用 `with` 创建新对象。

```csharp
var user2 = user1 with { Age = 26 };
```

这行代码不会改变 `user1`，而是生成一个新对象 `user2`，只有 `Age` 不同。这叫非破坏性修改，是 [[functional-programming]] 的典型做法。

我当时就好奇了：C# 不是面向对象语言吗，怎么还搞函数式这套？

## ✦ 函数式编程是什么

查了资料后，我觉得 [[functional-programming]] 就是一种写代码的约定。核心几条：

**[[pure-function]]**：同样输入，永远同样输出，不偷偷改全局变量，不写数据库，不打印控制台。

**[[immutability]]**：变量创建后不改。想改？用 `with` 那样生成新的。

**函数当参数传递**：函数可以像变量一样传来传去，C# 里用 `Func` 和 `Action` [[delegate]] 实现。

**声明式写法**：告诉程序"做什么"，而不是"怎么做"。LINQ 就是典型，比 `for` 循环清晰。

关于 [[pure-function]]，我想起以前常用的一个技巧：用异常过滤器记日志。

```csharp
try { ... }
catch(Exception ex) when (LogException(ex)) { }
```

这不算函数式。`when` 本意是条件判断，拿来偷偷执行 I/O 操作，违背了纯函数的原则。函数式处理错误一般不抛异常，而是返回 [[result-t]] 这样的包装对象。

## ✦ 不用语法糖也能函数式

没有 `record` 语法糖，能不能写函数式代码？能。

[[functional-programming]] 是思想约束。老版本 C# 里，你可以：

- 把 class 属性设为只读，只通过构造函数赋值，手写克隆方法返回新对象。这就是 [[immutability]]。
- 写静态方法，不碰实例状态，只靠参数算结果。这就是 [[pure-function]]。
- 写方法接收 `Func<T, bool>` 参数来过滤集合。这就是高阶函数。

C# 近几年加的语法糖（LINQ、`record`、[[pattern-matching]]），就是让函数式代码写起来不那么别扭。

## ✦ 链式编程和函数式编程

看这段代码时，我脑子里冒出个问题：

```csharp
var finalUser = user1.With(age: 26).With(name: "Alice");
```

这叫 [[chaining]] 还是 [[functional-programming]]？

理清后发现，这是两回事：

**[[chaining]]** 是写法：方法返回对象，就能用点号接下去。

**[[functional-programming]]** 是约束：链的每一步都不能改原数据，得生成新数据。

`StringBuilder` 就是反例：

```csharp
sb.Append("Hello").Append("World");
```

这是 [[chaining]]，但不是函数式。`Append` 在内部改了 `sb` 自身的状态。

LINQ 和 `record` 的 `With()` 不同，它们每一步都生成新拷贝，没有副作用。所以它们既是链式写法，也是函数式实现。

## ✦ 小结

从 `struct` 面试题出发，顺着 `record` 和 `with` 的线索，我搞明白了 [[functional-programming]]，也分清了 [[chaining]] 和函数式编程的区别。

现在的 C# 已经不是纯粹的面向对象语言了。微软加的这些语法糖，大概就是想让我们用面向对象建模，用函数式写逻辑。

保持好奇心，顺着一个语法点往下挖，能学到不少东西。
