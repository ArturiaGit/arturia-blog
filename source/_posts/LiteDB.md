---
title: 'LiteDB: Arturia.ShortLink — LiteDB 封装实践'
cover: /img/bg/litedb-cover.webp
abbrlink: 1pyagj9c
date: 2026-06-28 19:59:23
categories:
  - 技术实践
tags:
  - LiteDB
  - NoSQL
  - .NET
  - 仓储模式
  - CSharp
glossary:
  LiteDB:
    title: LiteDB
    brief: 轻量级嵌入式 NoSQL 数据库，以单文件形式运行，专为 .NET 生态设计。
  NoSQL:
    title: NoSQL
    brief: 非关系型数据库范式，不使用传统 SQL 查询，适合文档与键值等结构的数据存储。
  BsonExpression:
    title: BsonExpression
    brief: LiteDB 内部的表达式 DSL，用于描述数据查询条件与字段变换逻辑。
  BsonValue:
    title: BsonValue
    brief: LiteDB 的基础值类型，所有文档字段的读写均通过此类型中转。
  DependencyInjection:
    title: 依赖注入
    brief: 将对象的依赖关系交由外部 IoC 容器管理，而非在类内部硬编码 new 的设计模式。
  RepositoryPattern:
    title: 仓储模式
    brief: 在数据访问层与业务层之间引入抽象接口层，隔离底层存储实现细节。
  CRUD:
    title: CRUD
    brief: 数据基本操作的通用缩写：Create（创建）、Read（读取）、Update（更新）、Delete（删除）。
---

## ✦ LiteDB 原始 API 简介(LiteDB Original API Overview)

[[LiteDB]](https://www.litedb.org/) 是一个轻量级嵌入式 [[NoSQL]] 数据库，核心入口是 `LiteDatabase` 类，通过连接字符串初始化，并需要手动释放：

```csharp
using var db = new LiteDatabase(@"Filename=app.db;Connection=direct");
var collection = db.GetCollection<User>("users");
```

`ILiteCollection<T>` 提供了完整的 [[CRUD]] 方法：

| 方法 | 作用 | 说明 |
|------|------|------|
| `FindById(BsonValue id)` | 按 ID 查询 | ID 类型为 `[[BsonValue]]` |
| `Find(Expression<Func<T, bool>> predicate)` | 按谓词查询 | 返回 `IEnumerable<T>` |
| `Insert(T entity)` / `Insert(IEnumerable<T>)` | 插入 | 返回 `BsonValue` / `int` |
| `InsertBulk(IEnumerable<T>, int batchSize)` | 批量插入 | 带批次参数 |
| `Update(T entity)` / `Update(IEnumerable<T>)` | 更新 | 返回 `bool` / `int` |
| `Upsert(T entity)` / `Upsert(BsonValue id, T entity)` | 新增或更新 | 返回 `bool` |
| `UpdateMany(BsonExpression transform, BsonExpression predicate)` | 批量表达式更新 | 参数需构造 `BsonExpression` 对象 |
| `EnsureIndex(string name, BsonExpression expression, bool unique)` | 创建索引 | 同样需构造 `BsonExpression` |
| `DropIndex(string name)` | 删除索引 | |
| `Delete(BsonValue id)` | 按 ID 删除 | 返回 `bool` |
| `DeleteMany(Expression<Func<T, bool>> predicate)` | 批量删除 | 返回 `int` |

三个明显的痛点：

- `UpdateMany` 和 `EnsureIndex` 暴露了 `[[BsonExpression]]`——调用方需要了解 LiteDB 内部 DSL 和 `BsonExpression.Create()` 的调用方式
- 所有方法不内置日志，异常排查必须在外层逐一包裹 try-catch
- `LiteDatabase` 的生命周期需手动管理，与 [[DependencyInjection]] 容器配合不够自然

## ✦ 为什么封装(Why Wrap)

### ✦ 减少冗余与统一日志(Less Boilerplate, Unified Logging)

不使用封装时，每次 CRUD 调用的代码模式高度重复：

```csharp
// 每个实体每调一次 CRUD 都要写一遍 try-catch + 日志
try
{
    var db = new LiteDatabase(connectionString);
    var col = db.GetCollection<User>("users");
    _logger.LogDebug("查询 User，ID: {Id}", id);
    return col.FindById(id);
}
catch (Exception ex)
{
    _logger.LogError(ex, "查询 User 失败，ID: {Id}", id);
    throw;
}
finally
{
    db.Dispose();
}
```

封装后，统一模板只需写一次——每个方法在父类中写一次 try-catch + 结构化日志，所有实体共享，消除重复。

### ✦ 隐藏底层实现细节(Hiding Implementation Details)

原始 `ILiteCollection<T>.UpdateMany` 接收 `[[BsonExpression]]` 参数：

```csharp
// LiteDB 原生方法
collection.UpdateMany(
    BsonExpression.Create("$.Name = UPPER($.Name)"),
    BsonExpression.Create("$.Age > 18")
);
```

封装后将 `BsonExpression.Create()` 的调用内化：

```csharp
// 封装后——调用方只需传字符串
int UpdateMany(string transform, string predicate);
```

内部实现自动完成 `BsonExpression.Create()`，调用方不感知 `BsonExpression` 的存在。`EnsureIndex(string, string, bool)` 同理。

这带来了两个好处：
- 调用方 API 签名更简洁
- 解除了对 LiteDB 内部类型的直接依赖

### ✦ 复用与面向接口编程(Reusability & Interface-Oriented Programming)

这正是 [[RepositoryPattern]] 的核心实践。`IRepository<TEntity>` 定义统一的数据访问契约，业务层只依赖接口：

```csharp
public class SomeService
{
    private readonly IRepository<AppConfigModel> _configRepo;

    public SomeService(IRepository<AppConfigModel> configRepo)
    {
        _configRepo = configRepo;
    }
}
```

好处：
- 可 Mock 测试
- 可替换存储后端（只需实现 `IRepository<T>`）
- 与 [[DependencyInjection]] 容器无缝集成（Scoped / Singleton）

### ✦ 生命周期管理(Lifecycle Management)

`LiteDbContext` 封装了 `LiteDatabase` 的初始化与释放，注入 DI 容器后由容器自动管理生命周期，业务代码完全不关心数据库连接的创建与销毁。

## ✦ 代码展示(Code Showcase)

### ✦ 实体基础契约 — IEntity\<TId\>(Entity Contract: IEntity\<TId\>)

```csharp
namespace Arturia.Core.Storage;

public interface IEntity<TId>
{
    public TId Id { get; set; }
}
```

### ✦ 仓储抽象接口 — IRepository\<TEntity\>(Repository Interface: IRepository\<TEntity\>)

```csharp
using System.Linq.Expressions;
using LiteDB;

namespace Arturia.Core.Storage;

public interface IRepository<TEntity> where TEntity : class, IEntity<Guid>
{
    public TEntity FindById(Guid id);
    public TEntity? FindFirstOrDefault(Expression<Func<TEntity, bool>> predicate);
    public IEnumerable<TEntity> Find(Expression<Func<TEntity, bool>> predicate);

    public bool Upsert(TEntity entity);
    public int Upsert(IEnumerable<TEntity> entities);
    public bool Upsert(Guid id, TEntity entity);

    public bool Update(TEntity entity);
    public bool Update(Guid id, TEntity entity);
    public int Update(IEnumerable<TEntity> entities);

    public int UpdateMany(string transform, string predicate);

    public Guid Insert(TEntity entity);
    public int Insert(IEnumerable<TEntity> entities);
    public int InsertBulk(IEnumerable<TEntity> entities, int batchSize = 5000);

    public bool EnsureIndex(Expression<Func<TEntity, bool>> expression, bool unique = false);
    public bool EnsureIndex(string name, string expression, bool unique = false);

    public bool DropIndex(string name);

    public bool Delete(Guid id);
    public int DeleteMany(Expression<Func<TEntity, bool>> predicate);
}
```

### ✦ 数据库连接封装 — LiteDbContext(Database Context: LiteDbContext)

```csharp
using LiteDB;
using Microsoft.Extensions.Logging;

namespace Arturia.Core.Storage;

public class LiteDbContext : IDisposable
{
    public LiteDatabase Database { get; }
    private readonly ILogger<LiteDbContext> _logger;

    public LiteDbContext(string connectionString, ILogger<LiteDbContext> logger)
    {
        _logger = logger;
        try
        {
            Database = new LiteDatabase(connectionString);
            _logger.LogDebug("LiteDB database initialized.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to initialize LiteDB database.");
            throw;
        }
    }

    public void Dispose()
    {
        Database.Dispose();
        _logger.LogDebug("LiteDbContext disposed.");
    }
}
```

### ✦ 仓储实现 — LiteDbRepository\<TEntity\>(Repository Implementation: LiteDbRepository\<TEntity\>)

```csharp
using System.Linq.Expressions;
using LiteDB;
using Microsoft.Extensions.Logging;

namespace Arturia.Core.Storage;

public class LiteDbRepository<TEntity> : IRepository<TEntity> where TEntity : class, IEntity<Guid>
{
    private readonly ILiteCollection<TEntity> _collection;
    private readonly ILogger<LiteDbRepository<TEntity>> _logger;
    private readonly string _entityName;

    public LiteDbRepository(LiteDbContext context, ILogger<LiteDbRepository<TEntity>> logger)
    {
        _logger = logger;
        _entityName = typeof(TEntity).Name;

        var db = context.Database;

        string collectionName = $"{typeof(TEntity).Name.ToLower()}s";
        _collection = db.GetCollection<TEntity>(collectionName);
    }

    public TEntity FindById(Guid id)
    {
        try
        {
            _logger.LogDebug("查询{Entity}，ID: {Id}", _entityName, id);
            return _collection.FindById(id);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "查询{Entity}失败，ID: {Id}", _entityName, id);
            throw;
        }
    }

    public TEntity? FindFirstOrDefault(Expression<Func<TEntity, bool>> predicate)
    {
        try
        {
            _logger.LogDebug("查询{Entity}，谓词: {Predicate}", _entityName, predicate);
            return _collection.Find(predicate).FirstOrDefault();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "查询{Entity}失败，谓词: {Predicate}", _entityName, predicate);
            throw;
        }
    }

    public IEnumerable<TEntity> Find(Expression<Func<TEntity, bool>> predicate)
    {
        try
        {
            _logger.LogDebug("查询{Entity}列表，谓词: {Predicate}", _entityName, predicate);
            return _collection.Find(predicate);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "查询{Entity}列表失败，谓词: {Predicate}", _entityName, predicate);
            throw;
        }
    }

    public bool Upsert(TEntity entity)
    {
        try
        {
            _logger.LogDebug("新增或更新{Entity}，ID: {Id}", _entityName, entity.Id);
            return _collection.Upsert(entity);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "新增或更新{Entity}失败，ID: {Id}", _entityName, entity.Id);
            throw;
        }
    }

    public int Upsert(IEnumerable<TEntity> entities)
    {
        var list = entities.ToList();
        try
        {
            _logger.LogDebug("批量新增或更新{Entity}，共{Count}条", _entityName, list.Count);
            return _collection.Upsert(list);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "批量新增或更新{Entity}失败，共{Count}条", _entityName, list.Count);
            throw;
        }
    }

    public bool Upsert(Guid id, TEntity entity)
    {
        try
        {
            _logger.LogDebug("新增或更新{Entity}，ID: {Id}", _entityName, id);
            return _collection.Upsert(id, entity);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "新增或更新{Entity}失败，ID: {Id}", _entityName, id);
            throw;
        }
    }

    public bool Update(TEntity entity)
    {
        try
        {
            _logger.LogDebug("更新{Entity}，ID: {Id}", _entityName, entity.Id);
            return _collection.Update(entity);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "更新{Entity}失败，ID: {Id}", _entityName, entity.Id);
            throw;
        }
    }

    public bool Update(Guid id, TEntity entity)
    {
        try
        {
            _logger.LogDebug("更新{Entity}，ID: {Id}", _entityName, id);
            return _collection.Update(id, entity);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "更新{Entity}失败，ID: {Id}", _entityName, id);
            throw;
        }
    }

    public int Update(IEnumerable<TEntity> entities)
    {
        var list = entities.ToList();
        try
        {
            _logger.LogDebug("批量更新{Entity}，共{Count}条", _entityName, list.Count);
            return _collection.Update(list);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "批量更新{Entity}失败，共{Count}条", _entityName, list.Count);
            throw;
        }
    }

    public int UpdateMany(string transform, string predicate)
    {
        if (string.IsNullOrEmpty(transform))
            throw new ArgumentNullException(nameof(transform));
        if (string.IsNullOrEmpty(predicate))
            throw new ArgumentNullException(nameof(predicate));

        try
        {
            _logger.LogDebug("批量更新{Entity}，转换: {Transform}，谓词: {Predicate}", _entityName, transform, predicate);

            BsonExpression bsonTransform = BsonExpression.Create(transform);
            BsonExpression bsonPredicate = BsonExpression.Create(predicate);

            return _collection.UpdateMany(bsonTransform, bsonPredicate);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "批量更新{Entity}失败，转换: {Transform}，谓词: {Predicate}", _entityName, transform, predicate);
            throw;
        }
    }

    public Guid Insert(TEntity entity)
    {
        try
        {
            _logger.LogDebug("插入{Entity}", _entityName);
            return _collection.Insert(entity);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "插入{Entity}失败", _entityName);
            throw;
        }
    }

    public int Insert(IEnumerable<TEntity> entities)
    {
        var list = entities.ToList();
        try
        {
            _logger.LogDebug("批量插入{Entity}，共{Count}条", _entityName, list.Count);
            return _collection.Insert(list);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "批量插入{Entity}失败，共{Count}条", _entityName, list.Count);
            throw;
        }
    }

    public int InsertBulk(IEnumerable<TEntity> entities, int batchSize = 5000)
    {
        var list = entities.ToList();
        try
        {
            _logger.LogDebug("批量插入{Entity}，共{Count}条，批次大小: {BatchSize}", _entityName, list.Count, batchSize);
            return _collection.InsertBulk(list, batchSize);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "批量插入{Entity}失败，共{Count}条，批次大小: {BatchSize}", _entityName, list.Count, batchSize);
            throw;
        }
    }

    public bool EnsureIndex(Expression<Func<TEntity, bool>> expression, bool unique = false)
    {
        try
        {
            _logger.LogDebug("确保索引{Entity}，表达式: {Expression}，唯一: {Unique}", _entityName, expression, unique);
            return _collection.EnsureIndex(expression, unique);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "确保索引{Entity}失败，表达式: {Expression}，唯一: {Unique}", _entityName, expression, unique);
            throw;
        }
    }

    public bool EnsureIndex(string name, string expression, bool unique = false)
    {
        try
        {
            _logger.LogDebug("确保索引{IndexName}，表达式: {Expression}，唯一: {Unique}", name, expression, unique);

            BsonExpression bsonExpression = BsonExpression.Create(expression);
            return _collection.EnsureIndex(name, bsonExpression, unique);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "确保索引{IndexName}失败，表达式: {Expression}，唯一: {Unique}", name, expression, unique);
            throw;
        }
    }

    public bool DropIndex(string name)
    {
        try
        {
            _logger.LogDebug("删除索引{IndexName}", name);
            return _collection.DropIndex(name);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "删除索引{IndexName}失败", name);
            throw;
        }
    }

    public bool Delete(Guid id)
    {
        try
        {
            _logger.LogDebug("删除{Entity}，ID: {Id}", _entityName, id);
            return _collection.Delete(id);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "删除{Entity}失败，ID: {Id}", _entityName, id);
            throw;
        }
    }

    public int DeleteMany(Expression<Func<TEntity, bool>> predicate)
    {
        try
        {
            _logger.LogDebug("批量删除{Entity}，谓词: {Predicate}", _entityName, predicate);
            return _collection.DeleteMany(predicate);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "批量删除{Entity}失败，谓词: {Predicate}", _entityName, predicate);
            throw;
        }
    }
}
```

## ✦ 总结(Summary)

封装让业务层只面对 `IRepository<T>` 这一抽象接口，无需关心 `BsonExpression`、`LiteDatabase` 生命周期、日志埋点等底层细节。统一的 try-catch 模板、隐藏的 `BsonExpression.Create()` 调用、与 DI 容器的自然集成——每一次 CRUD 操作都不再是碎片化的裸调用，而是走一条标准化、可观测的数据通道。
