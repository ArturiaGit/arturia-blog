---
title: 'OpenGenerics: C# 开放型泛型在仓储模式中的批量注册艺术'
cover: /img/bg/opengenerics-cover.webp
abbrlink: a7k3m9q2
date: 2026-06-23 23:42:33
categories:
  - .NET
tags:
  - 开放型泛型
  - 依赖注入
  - 仓储模式
  - 泛型
  - 反射
  - LiteDB
glossary:
  OpenGenerics:
    title: 开放型泛型
    brief: 类型参数未被完全绑定的泛型定义，如 List<>，可在运行时通过类型替换生成闭合式泛型实例
  ClosedGeneric:
    title: 闭合式泛型
    brief: 所有类型参数均已绑定的泛型，如 List<string>，编译器可确定完整类型信息
  RepositoryPattern:
    title: 仓储模式
    brief: 在数据访问层与业务逻辑层之间引入抽象层的设计模式，隔离数据源的实现细节
  DI:
    title: 依赖注入
    brief: 通过外部容器管理对象的创建与生命周期，实现组件间松耦合的设计模式
  IoC:
    title: IoC 容器
    brief: 控制反转容器，负责管理依赖关系和对象生命周期的基础设施
  GenericType:
    title: 泛型
    brief: C# 中通过类型参数实现代码复用的机制，支持编译时类型安全检查
  Reflection:
    title: 反射
    brief: .NET 运行时提供的元数据查询与动态类型构建机制，允许在运行时动态操作 System.Type
  LiteDB:
    title: LiteDB
    brief: 高性能、无依赖的 .NET 嵌入式 NoSQL 数据库，适合轻量级本地持久化
---

## ✦ 场景起点：仓储模式中的重复劳动（The Problem）

前阵子在封装 [[RepositoryPattern]] 时，我面对的是一个再常见不过的场景。项目的持久层建立在 [[LiteDB]] 之上，所有实体共享同一个 ID 类型 `Guid`，我提取了一个基约束：

```csharp
namespace Arturia.Core.Storage;

public interface IEntity<TId>
{
    TId Id { get; set; }
}
```

在这个约束之上，我定义了一个通用的仓储接口：

```csharp
using System.Linq.Expressions;

namespace Arturia.Core.Storage;

public interface IRepository<T> where T : class, IEntity<Guid>
{
    T GetById(Guid id);
    T? GetFirstOrDefault(Expression<Func<T, bool>> predicate);

    IEnumerable<T> GetAll();
    IEnumerable<T> Find(Expression<Func<T, bool>> predicate);

    int Insert(T entity);
    int InsertBulk(IEnumerable<T> entities);

    bool Update(T entity);
    int Update(IEnumerable<T> entities);

    bool Upsert(T entity);
    int Upsert(IEnumerable<T> entities);

    bool Delete(Guid id);
    int DeleteMany(Expression<Func<T, bool>> predicate);

    bool EnsureIndex(Expression<Func<T, bool>> predicate, bool unique = false);
}
```

LiteDB 的实现也很直接——一个泛型类，把 `ILiteCollection<T>` 的操作统统包了一层，同时约定集合名以小写类名加 `s` 命名：

```csharp
using System.Linq.Expressions;
using LiteDB;

namespace Arturia.Core.Storage;

public class LiteDbRepository<T> : IRepository<T> where T : class, IEntity<Guid>
{
    private readonly ILiteCollection<T> _collection;

    public LiteDbRepository(LiteDbContext context)
    {
        var db = context.Database;
        string collectionName = typeof(T).Name.ToLower() + "s";
        _collection = db.GetCollection<T>(collectionName);
    }

    public T GetById(Guid id)
        => _collection.FindById(id);

    public T? GetFirstOrDefault(Expression<Func<T, bool>> predicate)
        => _collection.Find(predicate).FirstOrDefault();

    public IEnumerable<T> GetAll()
        => _collection.FindAll();

    public IEnumerable<T> Find(Expression<Func<T, bool>> predicate)
        => _collection.Find(predicate);

    public int Insert(T entity)
        => _collection.Insert(entity);

    public int InsertBulk(IEnumerable<T> entities)
        => _collection.InsertBulk(entities);

    public bool Update(T entity)
        => _collection.Update(entity);

    public int Update(IEnumerable<T> entities)
        => _collection.Update(entities);

    public bool Upsert(T entity)
        => _collection.Upsert(entity);

    public int Upsert(IEnumerable<T> entities)
        => _collection.Upsert(entities);

    public bool Delete(Guid id)
        => _collection.Delete(id);

    public int DeleteMany(Expression<Func<T, bool>> predicate)
        => _collection.DeleteMany(predicate);

    public bool EnsureIndex(Expression<Func<T, bool>> predicate, bool unique = false)
        => _collection.EnsureIndex(predicate, unique);
}
```

接口是泛型的，实现也是泛型的。这意味着项目中每一个实体都需要在 [[DI]] 容器里显式注册：

```csharp
// ❌ 朴素方案：每个实体一行注册
services.AddTransient<IRepository<User>, LiteDbRepository<User>>();
services.AddTransient<IRepository<Order>, LiteDbRepository<Order>>();
services.AddTransient<IRepository<Product>, LiteDbRepository<Product>>();
services.AddTransient<IRepository<Inventory>, LiteDbRepository<Inventory>>();
// ... 每加一个实体就多一行
```

这很快暴露出三个问题。第一，代码量与实体数量成正比——十个实体十行，一百个实体一百行。第二，每一次新增实体类型，都要记得回到注册方法里补一行，属于机械性的维护负担。第三，从架构角度看，这些注册行的语义完全相同——"把任意 `T` 的 `IRepository<T>` 映射到 `LiteDbRepository<T>`"——而我们却被迫为每一个 `T` 重复陈述一次。

有没有一种方式，能用**一行代码**完成对所有 `T` 的注册？

## ✦ 解决方案：一行代码覆盖所有实体（The Solution）

有。那就是 [[OpenGenerics]]：

```csharp
using Microsoft.Extensions.DependencyInjection;

namespace Arturia.Core.Storage;

public static class LiteDbServiceCollectionExtensions
{
    public static IServiceCollection AddLiteDb(this IServiceCollection services, string connectionString)
    {
        services.AddSingleton<LiteDbContext>(_ => new LiteDbContext(connectionString));
        services.AddTransient(typeof(IRepository<>), typeof(LiteDbRepository<>));
        return services;
    }
}
```

注意 `AddTransient` 的那一行。它没有像之前那样写 `IRepository<User>`，而是写了 `typeof(IRepository<>)`——尖括号里是**空的**。这意味着它不是在注册一个特定实体类型的仓储，而是在注册一个**模板**：任何一个 `T`，只要容器遇到 `IRepository<T>` 的解析请求，就自动构造一个 `LiteDbRepository<T>` 返回。

从现在起，项目里不论是 `IRepository<User>` 还是 `IRepository<AuditLog>` 还是未来新增的 `IRepository<BillingRecord>`，都不需要额外注册。这一行代码已经覆盖了所有可能。

## ✦ 概念解析：什么是开放型泛型（What Are Open Generics）

要理解这行代码为什么能工作，必须先厘清两个关键概念。

[[GenericType]] 在 C# 里分为两种形态：**闭合式泛型**和**开放型泛型**。

**闭合式泛型（[[ClosedGeneric]]）** 是所有类型参数均已绑定的泛型。编译器和运行时都清楚它是什么：

```csharp
Type closedType1 = typeof(List<string>);       // List<T> 的 T 被绑为 string
Type closedType2 = typeof(IRepository<User>);   // IRepository<T> 的 T 被绑为 User
```

闭合式泛型是"具体的东西"。`List<string>` 是一个确定无疑的类型，JIT 可以为之生成一份专属的机器码。

**开放型泛型（[[OpenGenerics]]）** 则是类型参数未被绑定或仅部分绑定的泛型，本质是一个"类型模板"：

```csharp
Type openType1 = typeof(List<>);               // List<T> 的 T 尚未绑定
Type openType2 = typeof(IRepository<>);         // IRepository<T> 的 T 尚未绑定
```

`List<>` 不是 `List<string>`，也不是 `List<int>`。它是一个更高层的抽象：所有 `List<T>` 的共同骨架。在 .NET 的 [[Reflection]] 体系里，`typeof(List<>)` 返回的 `System.Type` 对象上，`IsGenericTypeDefinition` 属性为 `true`，而 `typeof(List<string>)` 上这个属性为 `false`。

这就是"开放"与"闭合"的根本区别：前者是一个未完成的定义，后者是一个已落实的实例。正如蓝图与楼宇——蓝图可以盖无数栋楼，但蓝图本身不是楼。

## ✦ 底层逻辑：DI 容器如何解析开放型泛型（How It Works）

理解了开放型泛型是什么之后，接下来追踪 [[IoC]] 容器的解析链路。

当代码执行 `services.GetRequiredService<IRepository<User>>()` 时，容器内部会执行以下查找：

**第一步：精确匹配。** 容器在已注册的服务表中搜索 `IRepository<User>` 这个闭合式泛型。有没有人调用过 `AddTransient<IRepository<User>, LiteDbRepository<User>>()`？在这个场景下，没有人——我们只用了一行 `typeof(IRepository<>), typeof(LiteDbRepository<>)` 注册。所以精确匹配**不命中**。

**第二步：开放型泛型回退。** 容器发现请求的是一个泛型类型，于是提取出它的泛型定义——即 `IRepository<>`。然后用这个泛型定义去查找：有没有人注册过 `typeof(IRepository<>)` 这个开放型泛型？

**有。** 我们在注册时给出的正是 `typeof(IRepository<>)`。

**第三步：类型替换。** 容器拿到了实现类型 `LiteDbRepository<>`，这是一份模板。它将请求中的类型参数 `User` 代入模板的占位符，得到 `LiteDbRepository<User>`，然后照常走完构造函数解析和实例化流程。

整个过程可以用伪代码概括：

```text
请求: IRepository<User>
  → 精确查找 IRepository<User>          → 未命中
  → 提取泛型定义: IRepository<>
  → 查找开放泛型注册: IRepository<>     → 命中! 实现为 LiteDbRepository<>
  → 类型代入: LiteDbRepository<> + User → LiteDbRepository<User>
  → 解析构造函数, 注入依赖, 返回实例
```

这个机制是 Microsoft.Extensions.DependencyInjection 内建的。它在一个判定条件中检查 `serviceType.IsGenericType && serviceType.IsConstructedGenericType`，然后将构造泛型回溯为泛型定义去匹配注册表。不是黑魔法，但理解它之后，能让你在架构设计中多一层自由度。

## ✦ typeof() 的作用：为什么不能直接用泛型参数（Why typeof()）

你可能注意到，注册代码用的是 `typeof(IRepository<>)` 而不是 `IRepository<>` 直接写在泛型参数位置。为什么？为什么不能写成：

```csharp
// ❌ 编译错误
services.AddTransient<IRepository<>, LiteDbRepository<>>();
```

原因在于 C# 的类型系统在语法层面不允许**未绑定的泛型**出入泛型参数的位置。`AddTransient<TService, TImplementation>()` 是一个泛型方法，它的两个类型参数 `TService` 和 `TImplementation` 必须是**具体的类型**——可以是 `string`、可以是 `IRepository<User>`，但不能是 `IRepository<>`。`IRepository<>` 不是一个类型，它不能作为泛型类型实参，编译器会直接报错。

这就解释了为什么需要一个 `AddTransient(Type serviceType, Type implementationType)` 的重载。这个重载接受的不是编译时的泛型类型参数，而是两个 `System.Type` 对象。`typeof()` 运算符的工作就是返回一个 `System.Type`：

```csharp
// typeof() 相当于把类型"打包"成了 Type 对象，绕过了泛型语法限制
Type serviceType = typeof(IRepository<>);        // 开放型泛型，合法
Type implType = typeof(LiteDbRepository<>);       // 开放型泛型，合法
services.AddTransient(serviceType, implType);      // 调用 Type 版本的重载
```

这里有一个常见的误解需要澄清：**`typeof()` 不是运行时反射调用，它是编译期运算符。** 当 C# 编译器遇到 `typeof(IRepository<>)` 时，它直接从元数据表中读取 `IRepository<>` 的类型令牌，编码进 IL 然后由运行时加载为一个缓存好的 `System.Type` 实例。整个过程**没有遍历 Assembly、没有查找元数据字符串、没有运行时开销**。它和调用 `new()` 一样快。

把这个入口搞清楚之后，你再回头看那行注册代码，就能完整理解它的含义：

```csharp
services.AddTransient(typeof(IRepository<>), typeof(LiteDbRepository<>));
```

翻译成人话：**把泛型接口的模板 `IRepository<>` 注册为泛型实现的模板 `LiteDbRepository<>`。以后不管是 `User`、`Order` 还是任何其他 `T`，容器都按这个模具批量生产。**

## ✦ 一个常见误区：为什么不能把 T 提到方法上（A Common Pitfall）

读到这里，一个直觉性的问题会浮现出来：既然 `typeof()` 写法需要显式走 `Type` 重载，能不能直接把 `T` 提到扩展方法的泛型参数上，让代码更"自然"？

```csharp
public static IServiceCollection AddLiteDb<T>(this IServiceCollection services, string connectionString)
    where T : class, IEntity<Guid>
{
    services.AddSingleton<LiteDbContext>(_ => new LiteDbContext(connectionString));
    services.AddTransient<IRepository<T>, LiteDbRepository<T>>();
    return services;
}
```

**答案是：这段代码能编译通过。** 在 C# 中，方法级泛型参数是一个非常基础的语言能力，方法体内使用这个泛型参数构造更复杂的泛型类型实参——如 `IRepository<T>` 和 `LiteDbRepository<T>`——完全没有问题。

那么，编译器是怎么验证这一行的？`AddTransient<TService, TImplementation>` 本身有三个 `where` 约束。我们来逐层拆解编译器在这个调用站的验证链路：

```csharp
// AddTransient 的签名（简化）:
// AddTransient<TService, TImplementation>()
//     where TService : class
//     where TImplementation : class
//     where TImplementation : TService
```

| 步骤 | 编译器动作 | 结论 |
|------|-----------|------|
| 1 | 验证 `IRepository<T>` 满足 `TService : class` | `IRepository<T>` 是接口，接口本身即是引用类型 → 通过 |
| 2 | 验证 `LiteDbRepository<T>` 满足 `TImplementation : class` | 方法上声明了 `where T : class`，`T` 是引用类型，`LiteDbRepository<T>` 也是引用类型 → 通过 |
| 3 | 验证 `LiteDbRepository<T>` 满足 `TImplementation : TService` | 类定义中 `LiteDbRepository<T> : IRepository<T>` 明确了实现关系 → 通过 |

三步全部通过，编译成功。从这个角度看，`AddLiteDb<T>` 的写法在语法和类型系统层面没有硬伤。

但**能编译不等于能解决问题**。关键不在语法，在于**注册到容器里的到底是什么**。

当你写下 `services.AddLiteDb<User>(conn)` 时，方法级的 `T` 在**调用站**被绑定为 `User`。进入方法体后，`IRepository<T>` 已经坍缩为 `IRepository<User>`，`LiteDbRepository<T>` 已经坍缩为 `LiteDbRepository<User>`。底层的 `AddTransient<,>` 接收到的是一对**闭合式泛型**——它和裸写 `AddTransient<IRepository<User>, LiteDbRepository<User>>()` 没有区别。

紧接着你还需要写下 `services.AddLiteDb<Order>(conn)`、`services.AddLiteDb<Product>(conn)`，每新增一个实体类型就多一行。注册次数依旧是 O(n)。`AddLiteDb<T>` 只是把 N 行 `AddTransient` 换成了 N 行 `AddLiteDb`——包装换了，量级没变。

而 `typeof(IRepository<>)` 与之完全不同。它传递的不是一个已经绑定了 `T` 的具体类型，而是**泛型定义本身**——尖括号里是空的，不依赖于任何外部的 `T`：

```csharp
// ✅ 开放型泛型：尖括号留白，解析时由容器填入
services.AddTransient(typeof(IRepository<>), typeof(LiteDbRepository<>));
```

两相对比：

| | `AddLiteDb<T>` 方案 | `typeof(IRepository<>)` 方案 |
|--|---------------------|------------------------------|
| 能否编译 | ✅ 通过 | ✅ 通过 |
| T 的绑定时机 | 注册时（调用站） | 解析时（容器内部） |
| 注册到容器的内容 | 闭合式泛型，每次调用一个具体 T | 开放型泛型，一个泛型定义覆盖全部 |
| 实体扩展成本 | 新增实体 → 新增一行 `AddLiteDb<NewEntity>` | 新增实体 → 零修改 |
| 本质 | O(n) 语法糖 | O(1) 模板注册 |

一句话总结：**`AddLiteDb<T>` 中的 `T` 在编译期就关上了门——更糟的是，每调一次关一次；`typeof(IRepository<>)` 中的 `<>` 一直开着，只等容器在解析时亲自来完成类型代入。** 开放型泛型的"开放"二字，正在于此。

## ✦ 闭合式 vs 开放型：权衡与选择（Comparison）

两种注册方式并非优劣分明，而是各有适用场景。以下从几个工程维度做对比：

| 维度 | 闭合式泛型注册 | 开放型泛型注册 |
|------|--------------|--------------|
| 注册代码量 | O(n)，随实体数量线性增长 | O(1)，一行覆盖所有 |
| 类型安全 | 编译期检查，写错类型立即报错 | 运行时匹配，错误在解析时暴露 |
| 差异化能力 | 可为不同实体注入不同实现（User 用 LiteDbRepository，Order 用 SqlRepository） | 所有实体共享同一个实现模板 |
| 新实体接入成本 | 需修改注册代码，易遗漏 | 零修改，自动覆盖 |
| 性能 | 无额外开销，直接解析 | 一次性的类型替换，轻微开销可忽略 |

规则很简单。以下场景优先使用**开放型泛型**：

- 仓储模式、工作单元模式等"所有实体使用同一个存储实现"的情况。
- 装饰器模式中，对任意 `T` 的 `IService<T>` 做统一包装。
- MediatR 风格的 `IRequestHandler<TRequest, TResponse>` 注册。

以下场景继续使用**闭合式泛型**：

- 不同实体需要映射到不同实现（User 走 Redis 缓存层，Product 走直接数据库）。
- 部分实体类型需要特殊生命周期管理（如某几个实体是 Singleton）。
- 团队偏好编译期即报错的安全感，实体数量可控（通常不超过 15 个）。

对于大多数中小型项目来说，开放型泛型注册是性价比最高的选择——你几乎感受不到它的存在，直到你增加了一个新实体而忘了注册，才意识到它早已替你兜底。

## ✦ 星轨总结

一封 `IRepository<T>`，一行 `typeof()`，背后是 C# 类型系统对"抽象层级"的一次精妙支撑。

开放型泛型之所以重要，不只因为它能少写几行代码。它真正有意义的地方在于，它让类型参数本身成为了自定义的维度。闭合式泛型抽象了一类数据的结构，而开放型泛型抽象了一类泛型的注册——在"抽象"之上又多了一层抽象。那个留在尖括号里的空白，比一个被早早填满的 `T` 要有力量得多。

---

*星轨之下，好的架构从来不是写得最多，而是写得最少的那个。*
