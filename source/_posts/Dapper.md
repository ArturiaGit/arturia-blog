---
title: 'Dapper: 入门指南：轻量级ORM实战'
cover: /img/bg/dapper-cover.webp
abbrlink: j61ywwus
date: 2026-07-04 16:55:57
categories:
  - .NET
tags:
  - Dapper
  - ORM
  - SQLite
glossary:
  Dapper:
    title: Dapper
    brief: 由 Stack Overflow 团队开源的轻量级 Micro-ORM，以高性能和简洁著称，通过扩展 IDbConnection 提供便捷的对象映射能力。
  ORM:
    title: ORM
    brief: 对象关系映射（Object-Relational Mapping），将数据库表映射为程序中的对象，使开发者可以用面向对象的方式操作数据库。
  SQLite:
    title: SQLite
    brief: 轻量级嵌入式关系型数据库，无需独立服务器进程，数据库就是一个单一文件，适合本地存储和演示场景。
---

## ✦ 引言 (Introduction)

在 .NET 生态中操作数据库，Entity Framework Core（EF Core）往往是开发者的默认选择。然而，当你需要更高的性能、更精细的 SQL 控制、或是更低的资源开销时，一个更加轻量的选择便会进入视野——[[Dapper]]。

[[Dapper]] 是由 Stack Overflow 团队开发并开源的 **Micro-[[ORM]]**。它的核心理念很简单：在 ADO.NET 的 `IDbConnection` 之上，提供便捷的对象映射能力，同时不隐藏 SQL 的执行细节。自发布以来，Dapper 的 NuGet 下载量已超过 3.5 亿次，是目前 .NET 生态中最受欢迎的 Micro-ORM。

本文将基于一个 Dapper + [[SQLite]] 的实战 Demo，从环境准备、基础查询到事务处理，完整演示 Dapper 的核心用法。

## ✦ 环境准备 (Environment Setup)

在开始之前，先准备好开发环境和项目依赖。

### ✦ 版本信息 (Version Info)

| 组件 | 版本 |
|------|------|
| .NET | 10.0 |
| Dapper | 2.1.79 |
| System.Data.SQLite.Core | 1.0.119 |
| 演示工具 | LINQPad 9 |

### ✦ 安装 Dapper (Installation)

```bash
dotnet add package Dapper --version 2.1.79
dotnet add package System.Data.SQLite.Core --version 1.0.119
```

或在 LINQPad 中直接通过 NuGet 管理器搜索添加。

### ✦ 建立连接 (Connection)

```csharp
string connectionString = @"Data Source=Sqlite.db";
using SQLiteConnection con = new SQLiteConnection(connectionString);
```

[[Dapper]] 不依赖特定的数据库驱动，它直接扩展了 ADO.NET 的 `IDbConnection`。这意味着只要数据库有对应的 ADO.NET Provider，Dapper 就能工作。

### ✦ 实体类定义 (Entity Definitions)

Demo 中涉及四个实体类，对应数据库中的四张表：

```csharp
public sealed class User
{
    public int Id { get; set; }
    public string UserName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string City { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
    public List<Order> Orders { get; set; } = new();
}

public sealed class Order
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public string OrderNo { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public decimal TotalAmount { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? PaidAt { get; set; }
}

public sealed class Product
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public int Stock { get; set; }
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
}

public sealed class OrderItem
{
    public int Id { get; set; }
    public int OrderId { get; set; }
    public int ProductId { get; set; }
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal LineTotal { get; set; }
}
```

需要注意的是，`User` 类中包含了一个 `List<Order> Orders` 导航属性，这在之后的一对多映射中会用到。

## ✦ 基础查询 (Basic Query)

Dapper 最基础的功能就是执行 SQL 查询并将结果映射为强类型对象。

```csharp
string sql = @"select * from users";
con.Query<User>(sql).ToList().Dump();
```

以及对应的异步版本：

```csharp
(await con.QueryAsync<User>(sql)).ToList().Dump();
```

`Query<T>()` 是 Dapper 最核心的方法之一，它接收一个 SQL 字符串，返回 `IEnumerable<T>`。Dapper 内部会执行 `IDbCommand`、打开连接（如果未打开）、执行 `ExecuteReader`，然后通过反射将每一行数据映射到 `User` 对象的对应属性上。

![](/img/dapper/查询全部用户信息.webp)

## ✦ 参数化查询 (Parameterized Query)

直接拼接 SQL 字符串是安全大忌。[[Dapper]] 支持通过匿名对象或实体对象传递参数，底层使用 ADO.NET 的参数化机制，有效防止 SQL 注入。

### ✦ 单条件查询 (Single Condition)

```csharp
sql = @"select * from users where IsActive = @IsActive";
con.Query<User>(sql, new User() { IsActive = false }).ToList().Dump();
```

可以直接传入实体对象，Dapper 会将其属性名与 SQL 中的参数名 `@IsActive` 进行匹配。

![](/img/dapper/查询未激活的用户信息.webp)

### ✦ 多条件查询 (Multi Condition)

```csharp
sql = @"select * from users where City = @City and IsActive = @IsActive";
con.Query<User>(sql, new User() { IsActive = true, City = "Beijing" }).ToList().Dump();
```

也可以使用匿名对象，更加灵活：

```csharp
con.Query<User>(sql, new { IsActive = true, City = "Beijing" }).ToList();
```

![](/img/dapper/查询城市是北京且激活的用户信息.webp)

## ✦ 聚合与标量查询 (Aggregate & Scalar)

当只需要返回单个值（如 COUNT、SUM、AVG）时，可以使用 `ExecuteScalar<T>()`。

```csharp
sql = @"select count(*) from users where IsActive = @IsActive";
(await con.ExecuteScalarAsync<int>(sql, new User() { IsActive = false })).Dump();
```

`ExecuteScalarAsync<int>()` 将 SQL 执行结果的第一个单元格直接映射为 `int` 类型，无需经过对象映射，性能更优。

![](/img/dapper/查询未激活的用户数量.webp)

## ✦ 多结果集查询 (QueryMultiple)

在某些场景下，我们可能需要在一次数据库请求中返回多个结果集。Dapper 通过 `QueryMultiple` 提供这一能力。

```csharp
sql = @"select * from users limit 10;select * from orders limit 10";
using var multi = con.QueryMultiple(sql);
multi.Read<User>().ToList().Dump();
multi.Read<Order>().ToList().Dump();
```

`QueryMultiple` 执行用分号分隔的多条 SELECT 语句，返回 `SqlMapper.GridReader` 对象。之后依次调用 `Read<T>()` 即可逐个获取每个结果集。

> **提示**：`QueryMultiple` 也支持异步版本：`await con.QueryMultipleAsync(sql)`。

![](/img/dapper/查询前十条用户信息和前十条订单信息.webp)

## ✦ 多表映射 (One-to-Many Mapping)

在实际应用中，经常需要把用户和其关联的订单一起查出来。Dapper 提供了两种方式来实现一对多映射。

### ✦ 方法一：splitOn + Dictionary (Approach 1)

```csharp
sql = """
select * from (select * from users order by id desc limit 10) u
left join orders o on o.userid = u.id
""";

Dictionary<int, User> dic = new();
var r = con.Query<User, Order, User>(sql,
(u, o) =>
{
    if (!dic.TryGetValue(u.Id, out User result))
    {
        result = u;
        result.Orders = new List<Order>();
        dic.Add(result.Id, result);
    }

    result.Orders.Add(o);

    return result;
}, splitOn: "Id").ToList();
```

`Query<T1, T2, TReturn>()` 是 Dapper 的多映射 API。`splitOn: "Id"` 告诉 Dapper 在 `Id` 列处分拆两个对象（左表字段映射到 `User`，从 `Id` 开始映射到 `Order`）。

由于 LEFT JOIN 会产生笛卡尔积式的重复行（一个用户如果有 3 个订单，则该用户在结果集中会出现 3 次），需要通过 `Dictionary<int, User>` 做去重，将多个 Order 归并到同一个 User 的 Orders 列表中。

![](/img/dapper/查询前十条用户信息并挂载对应的订单信息——第一种方法.webp)

### ✦ 方法二：QueryMultiple + LINQ (Approach 2)

```csharp
sql = """
select * from users order by id desc limit 10;
select * from orders where userid in (select id from users order by id desc limit 10);
""";

using var multi2 = con.QueryMultiple(sql);
IEnumerable<User> users = multi2.Read<User>().ToList();
IEnumerable<Order> orders = multi2.Read<Order>().ToList();

foreach (User user in users)
    user.Orders = orders.Where(r => r.UserId == user.Id).ToList();

users.Dump();
```

这种方法思路更直白：先用 `QueryMultiple` 分别查出用户列表和订单列表（通过 IN 子查询限定范围），再用 LINQ 的 `Where` 在内存中手动建立关联。不需要 Dictionary 去重，逻辑更清晰，但多了一次内存操作。

![](/img/dapper/查询前十条用户信息并挂载对应的订单信息——第二种方法.webp)

### ✦ 对比 (Comparison)

| 维度 | 方法一（splitOn + Dictionary） | 方法二（QueryMultiple + LINQ） |
|------|-------------------------------|-------------------------------|
| 数据库请求次数 | 1 次 | 1 次 |
| SQL 复杂度 | 需要写 JOIN | 需要 IN 子查询 |
| 去重方式 | Dictionary 手动去重 | 天然无需去重 |
| 内存开销 | 结果集可能因 JOIN 膨胀 | 两次独立查询，内存可控 |
| 可读性 | 稍复杂 | 直观易懂 |

## ✦ DDL 操作 (DDL Operations)

[[Dapper]] 不仅能查询，还能执行 DDL 语句。通过 `Execute()` / `ExecuteAsync()` 执行任意 SQL。

```csharp
sql = """
create table if not exists Categories
(
    Id integer primary key autoincrement,
    Name text not null,
    Description text null,
    IsActive integer not null default 1,
    CreatedAt text not null
);
""";
(await con.ExecuteAsync(sql)).Dump();
```

`ExecuteAsync()` 返回受影响的行数，DDL 语句通常返回 0。

验证表是否创建成功：

```csharp
sql = "pragma table_info(Categories);";
con.Query(sql).ToList().Dump();
```

![](/img/dapper/建表.webp)

## ✦ 增删改操作 (CRUD)

### ✦ 批量插入 (Batch Insert)

```csharp
sql = @"insert into categories(Name, Description, IsActive, CreatedAt) values(@Name, @Description, @IsActive, @CreatedAt)";
var categories = new[]
{
    new
    {
        Name = "Books",
        Description = "Books, guides, and learning materials",
        IsActive = true,
        CreatedAt = DateTime.Now
    },
    new
    {
        Name = "Electronics",
        Description = "Computer accessories and electronic devices",
        IsActive = true,
        CreatedAt = DateTime.Now
    },
    new
    {
        Name = "Office",
        Description = "Office supplies and productivity tools",
        IsActive = true,
        CreatedAt = DateTime.Now
    }
};

(await con.ExecuteAsync(sql, categories)).Dump();
```

传入匿名对象数组时，Dapper 会遍历数组，为每个元素执行一次参数化 INSERT。虽然底层仍是逐条执行，但代码比手动循环简洁很多。

> **注意**：对于大规模批量插入场景，建议使用 Dapper Plus 等第三方扩展，它们支持真正的批量操作，可提升 75 倍以上的插入性能。

![](/img/dapper/批量插入数据.webp)

### ✦ 删除数据 (Delete)

```csharp
sql = @"delete from categories where Name = @Name";
(await con.ExecuteAsync(sql, new { Name = "Office" })).Dump();

sql = @"select * from categories";
(await con.QueryAsync(sql)).ToList().Dump();
```

参数化删除，传入要删除的 Name。执行后再次查询验证。

![](/img/dapper/删除数据.webp)

### ✦ 更新数据 (Update)

```csharp
sql = @"update categories set IsActive = @IsActive where Name = @Name";
(await con.ExecuteAsync(sql, new { IsActive = 0, Name = "Books" })).Dump();

sql = @"select * from categories";
(await con.QueryAsync(sql)).ToList().Dump();
```

将 Books 分类设置为未激活状态，返回值是受影响的行数。

![](/img/dapper/更新数据.webp)

## ✦ 事务处理 (Transaction)

数据库操作中，事务是保证数据一致性的重要机制。[[Dapper]] 的事务管理直接基于 ADO.NET 的连接事务。

```csharp
using var tran = await con.BeginTransactionAsync();
try
{
    sql = @"update users set IsActive = @IsActive where id in @ids";
    int rows = await con.ExecuteAsync(sql, new { IsActive = false, ids = new[] { 1, 2, 3, 4, 5 } }, tran);
    await tran.CommitAsync();
    rows.Dump();

    sql = @"select * from users order by id asc limit 5";
    (await con.QueryAsync<User>(sql)).Dump();
}
catch
{
    tran.Rollback();
    throw;
}
```

关键步骤：

- `BeginTransactionAsync()` 开启事务
- `ExecuteAsync` 的第三个参数传入事务对象 `tran`，将本次操作纳入事务管理
- 成功后调用 `CommitAsync()` 提交
- 异常时调用 `Rollback()` 回滚

> **注意**：Dapper 的方法通常会隐式打开连接。但事务必须先于操作开启，因此需要在调用 `BeginTransactionAsync()` 之前确保连接已打开，或者 Dapper 会自动管理。

![](/img/dapper/批量更新数据和开启事务.webp)

## ✦ Dapper vs EF Core (Comparison)

作为 .NET 生态中最常用的两种数据访问方案，[[Dapper]] 和 EF Core 各有适合的场景。

### ✦ 对比概览 (Overview)

| 维度 | Dapper | EF Core |
|------|--------|---------|
| 类型 | Micro-ORM | 全功能 ORM |
| 对象映射 | ✅ | ✅ |
| 自动生成 SQL | ❌（需手写） | ✅ |
| 变更追踪 | ❌ | ✅ |
| 懒加载 | ❌ | ✅ |
| 缓存 | ❌ | ✅ |
| 数据库迁移 | ❌ | ✅ |
| SQL 控制粒度 | 完全可控 | 由 LINQ 翻译，间接控制 |
| 学习曲线 | 低 | 中高 |
| 启动速度 | 极快 | 较慢（首次 Model Building） |
| 运行时性能 | 极高 | 较优（部分场景有开销） |

### ✦ 性能 (Performance)

Dapper 接近裸 ADO.NET 的性能水平。它不生成 SQL、不做变更追踪、不维护对象状态图——它做的就是执行你给出的 SQL 并把结果映射成对象。Stack Overflow 之所以创造 Dapper，正是因为 Linq to SQL（EF Core 的前身）在当时无法满足高并发需求。

EF Core 在大多数场景下性能足够，但它的 SQL 翻译层、变更追踪器和对象状态管理都会带来额外开销，尤其在处理大量数据时。

### ✦ 灵活性 (Flexibility)

Dapper 给了你完全的 SQL 控制权。你可以写任何合法的 SQL——复杂 JOIN、窗口函数、CTE、存储过程——Dapper 不会对你的 SQL 做任何解释或改写。这也意味着你需要自己管理 SQL 的版本和兼容性。

EF Core 则通过 LINQ 屏蔽了 SQL 细节，大多数情况下你不需要写一行 SQL。但当 LINQ 翻译出的 SQL 不够理想时，调试和优化的难度会上升。

### ✦ 复杂度 (Complexity)

Dapper 的 API 非常精简：`Query`、`Execute`、`QueryMultiple`、`ExecuteScalar`，几乎就是全部。学习成本极低。

EF Core 功能丰富但概念繁多：DbContext、DbSet、Fluent API、Data Annotations、Migration、ChangeTracker、Navigation Property 配置……新手容易陷入配置的泥潭。

### ✦ 适用 Dapper 的场景 (When to Use Dapper)

- 对性能有较高要求（高并发、大数据量）
- 需要完全控制 SQL 的执行细节
- 数据库结构复杂或不规范，不适合 EF Core 的约定映射
- 项目团队对 SQL 熟练，不希望被 ORM 黑盒遮挡
- 无状态场景（如 Web API），不需要持久化对象图

### ✦ 适用 EF Core 的场景 (When to Use EF Core)

- 需要快速开发，优先考虑开发效率
- 数据库结构规范，适合约定映射
- 需要自动迁移、变更追踪、懒加载等高级特性
- 团队更偏好写 LINQ 而非 SQL
- 需要兼容多种数据库（EF Core 的 Provider 生态更完善）

### ✦ 能否混用？ (Can We Mix Both?)

完全可以。事实上很多项目会这样分工：EF Core 负责常规 CRUD 和简单查询，Dapper 负责高性能查询和复杂报表。但需要注意避免两者的事务和连接管理相互干扰。

### ✦ 延伸阅读 (Further Reading)

- [Learn Dapper](https://www.learndapper.com/) —— Dapper 官方教程站，涵盖从入门到进阶的完整内容
- [Dapper vs EF Core: Which ORM Framework Should You Choose](https://levelup.gitconnected.com/dapper-vs-ef-core-which-orm-framework-should-you-choose-for-your-net-application-54f2723b176a) —— Selim YILDIZ 的深度对比文章

## ✦ 总结 (Summary)

本文通过一个 [[SQLite]] 实战 Demo，完整覆盖了 [[Dapper]] 的核心用法：

- **查询**：`Query<T>` / `QueryAsync<T>`，简单直接的强类型映射
- **参数化**：匿名对象或实体对象传参，安全防注入
- **标量查询**：`ExecuteScalar<T>`，高效获取单个值
- **多结果集**：`QueryMultiple` + `Read<T>`，一次请求多张表
- **一对多映射**：splitOn + Dictionary 去重，或 QueryMultiple + LINQ 手动挂载
- **DDL**：`ExecuteAsync` 执行建表等数据库定义语句
- **增删改**：批量插入、参数化删除与更新
- **事务**：`BeginTransactionAsync` + `CommitAsync` / `Rollback`

Dapper 是一个"把选择权交给开发者"的工具。你不必在 ORM 和 Micro-ORM 之间二选一——在实际项目中，Dapper 和 EF Core 各司其职的混合架构往往是最佳实践。

---

## ✦ 附录：完整代码 (Appendix: Full Code)

以下是本文 Demo 的完整源码，可直接在 LINQPad 中运行。

> **前提**：确保项目中已添加 Dapper 和 System.Data.SQLite.Core 的 NuGet 引用，且 `Sqlite.db` 文件路径正确。

```csharp
async Task Main()
{
    string connectionString = @"Data Source=Sqlite.db";
    using SQLiteConnection con = new SQLiteConnection(connectionString);

    //查询全部用户信息
    string sql = @"select * from users";
    con.Query<User>(sql).ToList().Dump();
    //(await con.QueryAsync<User>(sql)).ToList().Dump();

    //查询未激活的用户信息
    sql = @"select * from users where IsActive = @IsActive";
    con.Query<User>(sql, new User() { IsActive = false }).ToList().Dump();

    //查询未激活的用户数量
    sql = @"select count(*) from users where IsActive = @IsActive";
    (await con.ExecuteScalarAsync<int>(sql, new User() { IsActive = false })).Dump();

    //查询城市是北京且激活的用户信息
    sql = @"select * from users where City = @City and IsActive = @IsActive";
    con.Query<User>(sql, new User() { IsActive = true, City = "Beijing" }).ToList().Dump();

    //查询前十条用户信息和前十条订单信息
    sql = @"select * from users limit 10;select * from orders limit 10";
    using var multi = con.QueryMultiple(sql);
    multi.Read<User>().ToList().Dump();
    multi.Read<Order>().ToList().Dump();

    //查询前十条用户信息并挂载对应的订单信息——第一种方法
    sql = """
    select * from (select * from users order by id desc limit 10) u
    left join orders o on o.userid = u.id
    """;
    Dictionary<int, User> dic = new();
    var r = con.Query<User, Order, User>(sql,
    (u, o) =>
    {
        if (!dic.TryGetValue(u.Id, out User result))
        {
            result = u;
            result.Orders = new List<Order>();
            dic.Add(result.Id, result);
        }
        result.Orders.Add(o);
        return result;
    }, splitOn: "Id").ToList();
    dic.Values.ToList().Dump();

    //查询前十条用户信息并挂载对应的订单信息——第二种方法
    sql = """
    select * from users order by id desc limit 10;
    select * from orders where userid in (select id from users order by id desc limit 10);
    """;
    using var multi2 = con.QueryMultiple(sql);
    IEnumerable<User> users = multi2.Read<User>().ToList();
    IEnumerable<Order> orders = multi2.Read<Order>().ToList();
    foreach (User user in users)
        user.Orders = orders.Where(r => r.UserId == user.Id).ToList();
    users.Dump();

    //建表
    sql = """
    create table if not exists Categories
    (
        Id integer primary key autoincrement,
        Name text not null,
        Description text null,
        IsActive integer not null default 1,
        CreatedAt text not null
    );
    """;
    (await con.ExecuteAsync(sql)).Dump();
    sql = "pragma table_info(Categories);";
    con.Query(sql).ToList().Dump();

    //批量插入数据
    sql = @"insert into categories(Name, Description, IsActive, CreatedAt) values(@Name,@Description,@IsActive,@CreatedAt)";
    var categories = new[]
    {
        new { Name = "Books", Description = "Books, guides, and learning materials", IsActive = true, CreatedAt = DateTime.Now },
        new { Name = "Electronics", Description = "Computer accessories and electronic devices", IsActive = true, CreatedAt = DateTime.Now },
        new { Name = "Office", Description = "Office supplies and productivity tools", IsActive = true, CreatedAt = DateTime.Now }
    };
    (await con.ExecuteAsync(sql, categories)).Dump();

    //删除数据
    sql = @"delete from categories where Name = @Name";
    (await con.ExecuteAsync(sql, new { Name = "Office" })).Dump();
    sql = @"select * from categories";
    (await con.QueryAsync(sql)).ToList().Dump();

    //更新数据
    sql = @"update categories set IsActive = @IsActive where Name = @Name";
    (await con.ExecuteAsync(sql, new { IsActive = 0, Name = "Books" })).Dump();
    sql = @"select * from categories";
    (await con.QueryAsync(sql)).ToList().Dump();

    //批量更新数据+事务
    using var tran = await con.BeginTransactionAsync();
    try
    {
        sql = @"update users set IsActive = @IsActive where id in @ids";
        int rows = await con.ExecuteAsync(sql, new { IsActive = false, ids = new[] { 1, 2, 3, 4, 5 } }, tran);
        await tran.CommitAsync();
        rows.Dump();
        sql = @"select * from users order by id asc limit 5";
        (await con.QueryAsync<User>(sql)).Dump();
    }
    catch
    {
        tran.Rollback();
        throw;
    }
}

public sealed class User
{
    public int Id { get; set; }
    public string UserName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string City { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
    public List<Order> Orders { get; set; } = new();
}

public sealed class Order
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public string OrderNo { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public decimal TotalAmount { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? PaidAt { get; set; }
}

public sealed class Product
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public int Stock { get; set; }
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
}

public sealed class OrderItem
{
    public int Id { get; set; }
    public int OrderId { get; set; }
    public int ProductId { get; set; }
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal LineTotal { get; set; }
}
```
