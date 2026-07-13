---
title: 'CursorPagination: 从 Skip/Take 到 ULID 游标——两种分页方式的原理与实践'
cover: /img/bg/cursorpagination-cover.webp
abbrlink: ckmnuj9t
date: 2026-07-13 10:35:58
categories:
  - Avalonia
tags:
  - EF Core
  - ULID
  - 分页
  - C#
  - SQL
  - 游标分页
  - 偏移量分页
glossary:
  ULID:
    title: ULID
    brief: 通用唯一字典序可排序标识符，时间戳部分在高位，26 位 Crockford Base32 字符天然支持字符串排序，常作为分布式系统的有序主键替代 UUIDv4。
  OffsetPagination:
    title: 偏移量分页
    brief: 通过 Skip/Offset 丢弃前 N 行后截取固定数量结果的分页模型，依赖页码与偏移量的线性映射，适合静态数据集或后台管理表格。
  CursorPagination:
    title: 游标分页
    brief: 将上一页末条记录的排序键作为下页查询边界的分页模型，天然免疫前方数据插入或删除导致的位移偏差，是无限滚动和时间线的首选方案。
  KeysetPagination:
    title: 键集分页
    brief: 数据库层面的 Seek 分页实现，使用 WHERE 子句中的范围条件替代 OFFSET，数据库直接定位到键集边界开始扫描，避免大偏移量下的无效行丢弃。
  EFCore:
    title: Entity Framework Core
    brief: .NET 生态下的轻量级 ORM，支持 LINQ 查询翻译为数据库原生 SQL，其 Provider 层的表达式翻译能力直接决定了分页查询最终生成的 SQL 形态。
---

分页看起来只是"每次少查一些数据"，但当数据持续变化、用户不断向后浏览时，分页方式会直接影响结果是否稳定，以及查询能否在数据量增长后保持可接受的性能。

本文从 Arturia.ShortLink 的短链历史记录需求出发，对比[[OffsetPagination]]与[[CursorPagination]]，并使用 C#、[[EFCore]]和 SQL 给出一套基于项目实际服务代码的 [[ULID]] 游标分页实现。

## ✦ 业务背景 (Business Context)

Arturia.ShortLink 需要按时间从新到旧展示服务端生成记录。客户端首次加载一批记录，滚动接近底部时继续请求更早的数据。服务端的 `HistoryLinksService` 从 `Links` 表读取数据，并按照 `Link.Id` 倒序返回记录。数据会在用户浏览期间持续新增，也可能因为业务操作被删除或隐藏。

最直接的实现是使用 `Skip` 和 `Take`：第一页跳过 0 条，第二页跳过一个页面大小，第三页跳过两个页面大小。但这种方式记录的是数据的相对位置。当排在前面的数据发生变化时，后续页面的起点也会改变。

这正是[[OffsetPagination]]与[[CursorPagination]]的核心区别：

- 偏移量分页回答"跳过多少条"。
- 游标分页回答"从哪条记录之后继续"。

## ✦ 偏移量分页 (Offset Pagination)

### ✦ 定义与实现 (Definition & Implementation)

使用 `Skip` 和 `Take` 实现的分页通常称为[[OffsetPagination]]（Offset Pagination）或 Offset/Limit Pagination。使用页码表达时，也常被称为页码分页。

[[EFCore]]示例：

```csharp
IQueryable<Link> query = context.Links
    .AsNoTracking()
    .OrderByDescending(link => link.Id)
    .Skip((pageNumber - 1) * pageSize)
    .Take(pageSize);
```

对应的 SQL 形式通常是：

```sql
SELECT *
FROM Links
ORDER BY Id DESC
LIMIT @pageSize OFFSET @offset;
```

偏移量分页的优势很明确：实现简单、支持跳转到任意页，也容易结合 `COUNT(*)` 计算总页数。因此，后台管理表格、变化频率较低的数据，以及不会浏览到很深位置的列表，通常都适合这种方式。

### ✦ 为什么会出现重复 (Why Duplicates Occur)

假设页面大小为 3，初始数据按从新到旧排列：

```text
F E D C B A
```

第一页执行 `OFFSET 0 LIMIT 3`，得到：

```text
F E D
```

此时插入一条新记录 `G`：

```text
G F E D C B A
```

第二页仍然执行 `OFFSET 3 LIMIT 3`。数据库跳过当前的 `G F E`，返回：

```text
D C B
```

`D` 已经在第一页出现，因此产生重复。问题不在 `Skip` 的计算公式，而在于插入新记录后，原有记录的位置整体向后移动了。

### ✦ 为什么会出现遗漏 (Why Omissions Occur)

重新从原始数据开始，并假设第一页仍然返回 `F E D`。如果随后删除 `F`，当前数据变成：

```text
E D C B A
```

第二页执行 `OFFSET 3 LIMIT 3` 时，会跳过 `E D C`，返回：

```text
B A
```

`C` 没有在第一页出现，却被新的偏移量跳过，因此产生遗漏。

这两个例子说明：`OFFSET` 保存的是"当前位置"，而不是一个稳定的数据边界。只要偏移量之前的数据发生插入或删除，后续页面就可能移动。

### ✦ 深页查询的成本 (Cost of Deep Pagination)

假设每页 15 条，查询第 10,000 页时，偏移量已经达到 149,985。许多数据库即使能够利用索引完成排序，仍需要定位或扫描前面的记录，再将它们丢弃，只返回最后的 15 条。

因此，偏移量越大，查询成本通常越高。索引可以优化过滤和排序，但不能从根本上消除大偏移量。实际项目中应通过 `EXPLAIN` 或数据库执行计划观察访问路径和扫描行数，而不是只根据 SQL 外观判断性能。

## ✦ 游标分页与键集分页 (Cursor & Keyset Pagination)

### ✦ 基本原理 (Core Principle)

在 API 设计中，这种方案通常称为[[CursorPagination]]（Cursor Pagination）；从数据库查询方式来看，更准确的名称是[[KeysetPagination]]（Keyset Pagination）或 Seek Pagination。

它不再告诉数据库跳过多少条，而是提供上一页最后一条记录的排序键，让数据库从这个边界继续查找。

第一页：

```sql
SELECT *
FROM Links
WHERE IsActive = 1
ORDER BY Id DESC
LIMIT 16;
```

假设第一页最后返回的 ID 是 `01J...ABC`，下一页查询为：

```sql
SELECT *
FROM Links
WHERE IsActive = 1
  AND Id < @cursor
ORDER BY Id DESC
LIMIT 16;
```

这里按 `Id DESC` 排序，所以更早记录的 ID 应小于当前游标。如果改为升序排列，比较方向也必须相应改为 `Id > @cursor`。

### ✦ 为什么 ULID 可以作为游标 (Why ULID as Cursor)

[[ULID]]同时具备唯一性和可排序性。规范化的 26 位 ULID 字符串将时间部分放在前面，因此其字典序可以用于稳定排序。

作为游标时，需要满足以下条件：

- ID 创建后不再修改。
- 数据库统一保存规范格式，例如统一使用大写的 26 位字符串。
- 数据库字符集和排序规则不会破坏 ULID 的字典序。
- 查询条件与排序方向始终一致。

ULID 在同一毫秒内的随机部分仍能提供唯一且稳定的全序，但如果业务要求严格按照实际创建先后排序，应额外评估单调 ULID，或者使用 `(CreatedAt, Id)` 复合排序。系统时钟回拨也可能影响 ULID 时间顺序，这不影响键集边界的稳定性，却可能影响"ID 顺序等于真实创建时间"的业务假设。

### ✦ 为什么游标不会随前方数据偏移 (Why Cursor Stays Stable)

继续使用简化数据：

```text
F E D C B A
```

第一页返回 `F E D`，游标保存为 `D`。下一页查询固定为：

```sql
WHERE Id < 'D'
ORDER BY Id DESC
```

此时即使在前面插入 `G`，或者删除 `F`，小于 `D` 的记录仍然是 `C B A`。游标记录的是数据边界，而不是会移动的位置，因此不会因为游标之前的数据变化而重复或遗漏。

这个结论有明确前提：排序键必须唯一、稳定且不会修改。游标分页也不是数据库快照。首次加载之后新产生、且位于当前游标之前的数据，不会混入正在向后加载的页面，通常需要刷新第一页才能看到。如果新增记录被赋予一个小于当前游标的旧排序值，它仍可能出现在后续页面。

## ✦ 为什么要多读取一条 (Why Fetch One Extra Row)

假设页面大小为 15，如果查询只读取 15 条，就无法判断数据库中是否还有第 16 条。一个常用做法是读取 `PageSize + 1` 条：

```csharp
bool hasMore = links.Count > PageSize;

List<Link> pageLinks = links
    .Take(PageSize)
    .ToList();

string? nextCursor = hasMore
    ? pageLinks[^1].Id
    : null;
```

第 16 条只是探测记录，不返回给调用方。如果存在第 16 条，说明还有下一页，此时使用本页实际返回的第 15 条 ID 作为 `nextCursor`。

这里有几个容易写错的边界：

- 把探测用的第 16 条也返回，导致页面大小不稳定。
- 把第 16 条作为下一页游标，导致它既未返回，又被下一页的"小于游标"条件排除。
- 没有下一页时返回空字符串。客户端可能把空字符串当成有效游标，再次请求第一页。
- 复用并覆盖输入参数，使日志和调试时无法区分请求游标与响应游标。

没有更多数据时，`nextCursor` 应明确返回 `null`。

## ✦ Arturia.ShortLink 中的分页核心实现 (Core Implementation in Arturia.ShortLink)

下面的代码从当前 `HistoryLinksService` 提炼而来，保留项目现有的响应模型、DTO、查询方式和每页 15 条的约束，并补充 ULID 游标验证。为集中说明分页，省略了服务中的结构化日志、计时、取消捕获和未预期异常记录；`context` 与 `options` 仍由实际服务通过构造函数注入。

```csharp
using System.Net;
using Arturia.Core.Responses;
using ArturiaLink.Server.Configuration;
using ArturiaLink.Server.Dtos;
using ArturiaLink.Server.Models;
using Microsoft.EntityFrameworkCore;
using NUlid;

namespace ArturiaLink.Server.Services;

public class HistoryLinksService(
    ShortLinkOptions options,
    ArturiaShortLinkDbContext context) : IHistoryLinksService
{
    private const int PageSize = 15;

    public async Task<ApiResponse<LinkHistoryPageDto>> GetHistoryLinkAsync(
        string? nextCursor,
        CancellationToken cancellationToken)
    {
        string? requestCursor = null;

        if (nextCursor is not null)
        {
            if (!Ulid.TryParse(nextCursor, out Ulid parsedCursor))
            {
                return new ApiResponse<LinkHistoryPageDto>
                {
                    Success = false,
                    Code = (int)HttpStatusCode.BadRequest,
                    Message = "游标无效。"
                };
            }

            requestCursor = parsedCursor.ToString();
        }

        IQueryable<Link> query = context.Links
            .Where(link => link.IsActive);

        if (requestCursor is not null)
        {
            query = query.Where(link =>
                string.Compare(link.Id, requestCursor) < 0);
        }

        List<Link> links = await query
            .AsNoTracking()
            .OrderByDescending(link => link.Id)
            .Take(PageSize + 1)
            .ToListAsync(cancellationToken);

        bool hasMore = links.Count > PageSize;

        List<Link> pageLinks = links
            .Take(PageSize)
            .ToList();

        string? responseCursor = hasMore
            ? pageLinks[^1].Id
            : null;

        List<LinkHistoryItemDto> items = pageLinks
            .Select(link => new LinkHistoryItemDto(
                link.Id,
                link.TargetUrl,
                options.PublicBaseUri + link.Slug,
                link.CreatedAt))
            .ToList();

        return new ApiResponse<LinkHistoryPageDto>
        {
            Success = true,
            Code = (int)HttpStatusCode.OK,
            Data = new LinkHistoryPageDto(items, responseCursor)
        };
    }
}
```

这段代码包含几个关键决策：

1. 只有未提供游标，即参数为 `null` 时，才加载第一页。空字符串和空白字符串都无法通过 `Ulid.TryParse`，因此返回 `400 Bad Request`。
2. 合法游标先转换为规范 ULID 字符串，再参与数据库比较。
3. `AsNoTracking()` 表明这是只读查询，避免不必要的实体跟踪。
4. `Id DESC` 与 `Id < cursor` 共同定义向更早记录移动的方向。
5. `Take(PageSize + 1)` 只为判断下一页，实际返回数量仍为 `PageSize`。
6. `responseCursor` 取本页实际返回的最后一条记录；没有下一页时为 `null`。
7. `CancellationToken` 一直传递到 [[EFCore]]异步查询。

`string.Compare` 是否能够转换为数据库端比较取决于 [[EFCore]]Provider。现代 EF Core 通常会在关键查询表达式无法翻译时抛出异常，而不是静默执行客户端过滤。落地时仍应使用 `ToQueryString()`、EF Core SQL 日志或数据库监控确认最终 SQL 包含类似 `Id < @cursor` 的条件，并验证它能够使用预期索引。

项目使用统一的 `ApiResponse<T>` 响应外壳，因此示例直接把非法游标映射为 `400 Bad Request`，而不是让无效字符串进入数据库比较。

## ✦ 索引与性能检查 (Index & Performance Check)

[[CursorPagination]]并不意味着查询天然高效。最终查询大致是：

```sql
SELECT Id, TargetUrl, Slug, CreatedAt
FROM Links
WHERE IsActive = 1
  AND Id < @cursor
ORDER BY Id DESC
LIMIT 16;
```

如果 `Id` 是主键，数据库通常能够利用它进行范围查找。但查询还包含 `IsActive` 条件，优化器究竟选择主键索引、单列状态索引还是其他访问路径，取决于数据库、数据分布和字段选择性。

可以通过执行计划评估是否需要 `(IsActive, Id)` 复合索引。复合索引可能同时服务过滤、范围查询和排序，但也会增加写入与存储成本，因此不应在缺少实际数据和执行计划证据时机械添加。

## ✦ 如何选择分页方式 (How to Choose)

| 场景               |    偏移量分页    |     游标分页     |
| :----------------- | :--------------: | :--------------: |
| 任意页跳转         |       适合       |    不直接支持    |
| 展示总页数         |       容易       | 通常需要额外统计 |
| 无限滚动           |       一般       |       适合       |
| 数据持续新增或删除 | 容易产生位置偏移 |    边界更稳定    |
| 深页查询           |   成本通常增加   |    通常更稳定    |
| 实现复杂度         |       较低       |       较高       |
| 后台管理表格       |       适合       |    视需求而定    |
| 时间线和历史流     |       一般       |       适合       |

如果产品需要任意页跳转、总页数和页码导航，[[OffsetPagination]]通常更自然。如果产品以无限滚动、消息流、时间线或历史记录为主，并且数据会持续变化，[[CursorPagination]]更容易提供稳定的向后遍历。

同一个系统不必只选择一种方案。面向用户的动态历史流可以使用游标分页，强调任意页跳转的后台管理表格则可以继续使用偏移量分页。

## ✦ 结语 (Closing)

[[OffsetPagination]]和[[CursorPagination]]解决的是不同问题。偏移量分页以位置为中心，简单且适合页码导航；游标分页以稳定排序边界为中心，更适合持续变化的数据和深度遍历。

一个可靠的游标分页实现，不只是把 `Skip` 改成 `Where`。它还必须处理稳定且唯一的排序键、正确的比较方向、`PageSize + 1` 探测、可空的下一页游标、Provider 的 SQL 翻译，以及与查询条件匹配的索引。

理解"位置"和"边界"的差异，才是真正理解这两种分页方式的起点。
