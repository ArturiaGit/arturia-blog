---
title: 'Authentication: WebAPI 鉴权实践总结——从鉴权概念到 ASP.NET Core 自定义 Token 鉴权'
cover: /img/bg/authentication-cover.webp
abbrlink: a7b3k9xm
date: 2026-07-05 23:37:54
categories:
  - .NET
tags:
  - 鉴权
  - Token
  - ASP.NET Core
  - 安全
  - Minimal API
  - Bearer
glossary:
  Bearer Token:
    title: Bearer Token
    brief: 持有者令牌。通过标准 Authorization 请求头传输，持有即视为拥有访问权限的轻量鉴权机制。
  ClaimsPrincipal:
    title: ClaimsPrincipal
    brief: ASP.NET Core 中表示当前请求用户的声明主体，可包含一个或多个 ClaimsIdentity。
  JWT:
    title: JWT
    brief: JSON Web Token，自包含声明信息并通过签名防篡改的无状态令牌标准，适合分布式认证场景。
  OAuth2:
    title: OAuth2
    brief: 开放授权协议 2.0，定义授权码、客户端凭证等多种授权流程，广泛用于第三方登录与开放平台场景。
  Minimal API:
    title: Minimal API
    brief: ASP.NET Core 6+ 引入的轻量 HTTP API 构建方式，省去 Controller 层，通过 MapGet/MapPost 等直接定义端点。
  Middleware:
    title: Middleware
    brief: ASP.NET Core 请求管线的中间件组件，按注册顺序依次处理请求与响应，UseAuthentication/UseAuthorization 即为典型中间件。
  OpenID Connect:
    title: OpenID Connect
    brief: 基于 OAuth2 的身份认证协议层，提供 ID Token 与用户信息端点，用于统一身份认证。
---

这篇文章来自我在 ArturiaLink 项目中实现 WebAPI 鉴权时的一次实践总结。

ArturiaLink 是一个个人短链服务。当前 v1.0 阶段不需要注册、登录、多账号和复杂权限系统，只需要保护管理类 API，例如健康检查和创建短链接口。因此项目最终选择了比较轻量的单管理员 [[Bearer Token]] 鉴权方案。

这篇文章不会展开 [[JWT]]、[[OAuth2]] 这些复杂方案的完整实战，而是聚焦 WebAPI 鉴权本身：什么是鉴权，为什么需要鉴权，常见鉴权方式有哪些，以及在 ASP.NET Core [[Minimal API]] 中如何实现一套清晰、可维护的自定义 Token 鉴权。

## ✦ 什么是鉴权 (What is Authentication)

在 WebAPI 中，鉴权通常包含两个相近但不同的概念：

- **Authentication**：认证。确认当前请求是谁发起的。
- **Authorization**：授权。确认当前请求是否有权限访问某个接口。

简单说，Authentication 解决"你是谁"，Authorization 解决"你能不能访问这里"。

比如一个请求带着下面的请求头访问接口：

```http
Authorization: Bearer <your-admin-token>
```

服务端会先读取这个凭证，判断它是不是有效。如果有效，服务端会为当前请求创建一个用户身份，例如 `ArturiaLinkAdmin`。之后授权系统再判断当前接口是否要求登录、是否允许这个身份访问。

所以鉴权不是简单地在接口里写一个 `if` 判断。更合理的方式，是把它放在 Web 框架提供的认证与授权管线中，在请求进入业务逻辑之前统一处理。

## ✦ 为什么 WebAPI 需要鉴权 (Why WebAPI Needs Authentication)

WebAPI 一旦暴露到网络上，就不能默认相信所有请求。

对于短链服务来说，下面这些接口如果不做保护，就可能被任何人调用：

- 创建短链接口。
- 服务端配置检查接口。
- 未来的数据查询或管理接口。

这会带来几个问题：

- 别人可以滥用接口创建垃圾短链。
- 管理类接口可能暴露服务状态。
- 写入类操作可能被恶意脚本反复调用。
- 客户端和服务端之间缺少最基本的身份边界。

即使是个人项目，也应该至少有一层基础保护。ArturiaLink v1.0 不做多账号系统，但仍然需要一个单管理员 Token 来保护 `/api/v1` 下的管理 API。

同时，并不是所有接口都应该鉴权。短链跳转接口 `GET /{slug}` 是给真实访客访问的，它必须允许匿名请求。如果把所有接口都一刀切加上鉴权，短链本身就无法对外跳转了。

因此鉴权设计的第一步不是写代码，而是先划清边界：哪些接口需要保护，哪些接口必须公开。

## ✦ 鉴权的一般流程 (Authentication Flow)

一个典型的 WebAPI 鉴权流程大致如下：

```text
Client Request
    ↓
Authentication Middleware
    ↓
Read Token / Credential
    ↓
Validate Token / Credential
    ↓
Create ClaimsPrincipal
    ↓
Authorization Middleware
    ↓
Endpoint
```

对应到代码和请求上，就是：

1. 客户端保存访问凭证。
2. 客户端请求 API 时携带凭证。
3. 服务端从请求头、Cookie 或 Query 中读取凭证。
4. 服务端校验凭证是否合法。
5. 校验成功后创建 [[ClaimsPrincipal]]。
6. 授权系统判断当前接口是否允许访问。
7. 允许则进入业务逻辑，不允许则返回 `401` 或 `403`。

这里有两个常见状态码：

- `401 Unauthorized`：没有通过认证，通常表示未登录、Token 缺失或 Token 无效。
- `403 Forbidden`：已经识别了身份，但当前身份没有权限访问该资源。

ArturiaLink 当前只有单管理员 Token，没有角色权限系统，所以失败场景主要返回 `401`。

## ✦ 常见的鉴权方式 (Common Authentication Methods)

WebAPI 鉴权方案很多，不同方案适合不同复杂度的系统。

### ✦ API Key

API Key 是最简单的方式之一。客户端携带一个固定 key 调用接口，服务端校验 key 是否正确。

它可以放在 Header 中：

```http
X-Api-Key: <your-admin-token>
```

也可以放在 Query 中：

```http
GET /api/v1/health?api_key=<your-admin-token>
```

API Key 的优点是简单，缺点是表达能力弱。它通常不能很好地表示用户身份、过期时间、权限范围等信息。Query 方式还容易出现在日志、浏览器历史和代理记录里，所以更推荐放在 Header 中。

### ✦ Bearer Token

[[Bearer Token]] 是 WebAPI 中非常常见的方式。客户端通过标准 `Authorization` 请求头携带 token：

```http
Authorization: Bearer {Token}
```

"Bearer"的含义是：谁持有这个 token，谁就可以访问对应资源。

Bearer Token 本身可以是一个固定字符串，也可以是服务端签发的复杂令牌。ArturiaLink v1.0 使用的是单管理员固定 Token，属于 Bearer Token 的轻量用法。

### ✦ JWT

[[JWT]] 通常也是通过 Bearer Token 方式传输：

```http
Authorization: Bearer eyJhbGciOi...
```

它的特点是 token 自身包含声明信息，例如用户 ID、过期时间、签发者和权限范围，并且通过签名防篡改。

JWT 适合多用户、分布式、无状态认证场景。但对于 ArturiaLink v1.0 这种个人短链项目来说，引入 JWT 会带来额外复杂度，例如签名密钥管理、过期刷新、声明设计等。因此当前阶段没有使用 JWT。

### ✦ Cookie + Session

Cookie + Session 更常见于传统 Web 应用。浏览器登录后保存 Cookie，后续请求自动携带 Cookie，服务端通过 Session 识别用户。

这种方式对浏览器页面很自然，但对于桌面客户端调用 WebAPI 来说，显式的 Bearer Token 更直接，也更容易在 HTTP 客户端中统一注入。

### ✦ OAuth2 / OpenID Connect

[[OAuth2]] 和 [[OpenID Connect]] 适合第三方登录、开放平台、企业身份系统等复杂场景。

它们可以解决授权码流程、第三方应用授权、身份提供商接入、Token 刷新等问题。但这类方案复杂度很高，不适合作为个人工具 v1.0 的首选方案。

ArturiaLink 当前只需要保护自己的管理 API，所以使用单 Token 更符合 MVP 阶段的边界。

## ✦ ASP.NET Core 中的认证与授权 (Authentication & Authorization in ASP.NET Core)

ASP.NET Core 把鉴权拆成了两个环节：

- Authentication：认证请求，生成 [[ClaimsPrincipal]]。
- Authorization：根据策略或端点要求判断是否允许访问。

几个核心概念如下：

- `AuthenticationHandler`：认证处理器，负责读取请求并认证身份。
- `AuthenticationScheme`：认证方案名称，例如本项目中的 `ArturiaBearer`。
- `ClaimsIdentity`：表示一个身份。
- `ClaimsPrincipal`：表示当前请求用户，可以包含一个或多个身份。
- `RequireAuthorization()`：要求某个 [[Minimal API]] 端点或分组必须通过授权。

在 Minimal API 中，可以给单个接口加授权，也可以给整个分组加授权：

```csharp
var group = app.MapGroup("/api/v1")
    .RequireAuthorization();
```

这样 `/api/v1` 下的接口默认都需要鉴权，而不在这个分组里的短链跳转接口则不会被影响。

## ✦ 为什么选择单 Token 鉴权 (Why Single Token Authentication)

ArturiaLink v1.0 的需求很明确：

- 只有一个管理员。
- 客户端保存服务端地址和 Access Token。
- 客户端调用服务端 API 时携带 Token。
- 服务端验证 Token 后允许创建短链或检查健康状态。
- 不做注册、登录、多账号和角色权限。

需要鉴权的接口包括：

```http
GET /api/v1/health
POST /api/v1/links
```

不需要鉴权的接口是：

```http
GET /{slug}
```

因为 `GET /{slug}` 是真实访客访问短链时使用的跳转接口。如果它也要求 Token，短链就失去了公开访问的意义。

所以项目最终采用：

- 配置文件中保存单管理员 Token。
- 客户端使用 `Authorization: Bearer {Token}` 请求 API。
- 服务端使用自定义 `AuthenticationHandler` 校验 Token。
- `/api/v1` 分组统一 `.RequireAuthorization()`。
- 鉴权失败统一返回 `401`。

## ✦ 项目鉴权代码结构 (Project Auth Code Structure)

当前项目中的鉴权相关代码主要分布在几个位置：

```text
src/server/ArturiaLink.Server/
  Authentication/
    TokenAuthenticationHandler.cs
  Responses/
    UnauthorizedResponse.cs
  Program.cs
  Endpoints/
    V1Endpoints.cs
```

各自职责如下：

- `TokenAuthenticationHandler.cs`：鉴权核心逻辑，读取配置 Token、读取请求头、校验 [[Bearer Token]]、创建用户身份、处理鉴权失败响应。
- `UnauthorizedResponse.cs`：鉴权失败时返回给客户端的响应模型。
- `Program.cs`：注册认证方案、注册授权服务、启用认证和授权 [[Middleware]]。
- `V1Endpoints.cs`：对 `/api/v1` 分组启用 `.RequireAuthorization()`。

这种结构的好处是：鉴权逻辑不散落在每个接口里，后续新增 `/api/v1/links` 时也不需要重复写 token 校验。

## ✦ TokenAuthenticationHandler 核心实现 (Core Implementation)

自定义鉴权处理器继承：

```csharp
AuthenticationHandler<AuthenticationSchemeOptions>
```

然后定义当前认证方案名称：

```csharp
public const string SchemeName = "ArturiaBearer";
```

核心方法是：

```csharp
protected override Task<AuthenticateResult> HandleAuthenticateAsync()
```

它做几件事：

1. 从配置读取 `Authentication:Token`。
2. 从请求头读取 `Authorization`。
3. 判断请求头是否以 `Bearer ` 开头。
4. 取出真正的 token 字符串。
5. 与配置 token 做精确比较。
6. 成功后创建 `ClaimsIdentity` 和 [[ClaimsPrincipal]]。
7. 返回 `AuthenticateResult.Success(ticket)`。

配置文件中的 Token 示例：

```json
{
  "Authentication": {
    "Token": "<your-admin-token>"
  }
}
```

客户端请求示例：

```http
GET /api/v1/health
Authorization: Bearer <your-admin-token>
```

## ✦ 鉴权失败响应处理 (Handling Auth Failure)

一开始我以为：

```csharp
return Task.FromResult(AuthenticateResult.Fail("Bearer token is invalid."));
```

这里的错误信息会自动返回给客户端。实际并不会。

`AuthenticateResult.Fail(...)` 只是告诉 ASP.NET Core 认证管线"认证失败"，失败原因主要给内部流程或日志使用。默认情况下，客户端通常只会收到一个没有响应体的 `401 Unauthorized`。

如果希望鉴权失败时返回 JSON，需要重写：

```csharp
protected override async Task HandleChallengeAsync(AuthenticationProperties properties)
```

在这个方法里手动写入响应状态码和响应体。

鉴权失败响应建议保持克制：

```json
{
  "code": "401",
  "message": "Invalid or missing access token.",
  "traceId": "<trace-id>"
}
```

我不建议把具体失败原因直接返回给客户端，例如：

- Token 缺失。
- Token 格式错误。
- Token 不正确。
- 服务端没有配置 Token。

这些信息对合法客户端帮助有限，却会给攻击者更多试探空间。对外响应统一提示 `Invalid or missing access token.` 就够了。更详细的失败原因可以留给服务端日志。

## ✦ 踩过的坑 (Lessons Learned)

### ✦ AuthenticateResult.Fail 不等于响应体

`AuthenticateResult.Fail("xxx")` 里的 `"xxx"` 不会自动成为 HTTP 响应内容。

如果没有重写 `HandleChallengeAsync`，鉴权失败时可能只看到：

```http
HTTP/1.1 401 Unauthorized
```

但没有 JSON body。

解决方式是重写 `HandleChallengeAsync`，在里面调用 `Response.WriteAsJsonAsync(...)`。

### ✦ AuthenticationEvents 不能直接用

我一开始也想过通过事件来改 Challenge 响应，但自定义：

```csharp
AuthenticationHandler<AuthenticationSchemeOptions>
```

时，并不是直接使用某个通用的 `AuthenticationEvents` 就能解决。

像 `JwtBearerEvents`、`CookieAuthenticationEvents` 这类事件是具体认证方案提供的。当前项目是自定义认证处理器，更直接、清晰的方式是重写：

```csharp
HandleChallengeAsync(AuthenticationProperties properties)
```

这也是最后采用的方案。

### ✦ Bearer 前缀判断要带空格

错误写法：

```csharp
authorization.StartsWith("Bearer", StringComparison.OrdinalIgnoreCase)
```

这个判断太宽松，`BearerXXX` 也会通过前缀判断。

推荐写法：

```csharp
authorization.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
```

注意 `Bearer` 后面有一个空格。这样才能符合标准请求头格式：

```http
Authorization: Bearer <your-admin-token>
```

### ✦ ClaimsIdentity 要传入认证类型

不推荐：

```csharp
var identity = new ClaimsIdentity(claims);
```

推荐：

```csharp
var identity = new ClaimsIdentity(claims, SchemeName);
```

如果没有传入 `authenticationType`，`ClaimsIdentity.IsAuthenticated` 可能不是预期的 `true`，后续授权判断可能出现奇怪的问题。

### ✦ 中间件顺序不能写反

认证要在授权之前：

```csharp
app.UseAuthentication();
app.UseAuthorization();
```

如果顺序写反，授权阶段拿不到正确的认证结果。

在当前项目里，[[Middleware]] 放在 `UseHttpsRedirection()` 之后，`MapV1Endpoints()` 之前：

```csharp
app.UseHttpsRedirection();

app.UseAuthentication();
app.UseAuthorization();

app.MapV1Endpoints();
```

### ✦ 不要全量 RequireAuthorization

ArturiaLink 中只有 `/api/v1` 管理 API 需要鉴权。短链跳转接口 `GET /{slug}` 应该匿名访问。

所以我选择在 API 分组上加：

```csharp
app.MapGroup("/api/v1")
    .RequireAuthorization();
```

而不是给整个应用所有路由都强制鉴权。

## ✦ Apifox 验证 (Apifox Verification)

实现完成后，可以用 Apifox 或其他 HTTP 工具验证三种情况。

第一种：正确 Token，返回 `200 OK`。

```http
GET /api/v1/health
Authorization: Bearer <your-admin-token>
```

预期响应：

```json
{
  "ok": true,
  "serverTime": "2026-07-05T12:00:00+00:00"
}
```

![正确 Token 返回 200 的 Apifox 截图](/img/posts/apifox-auth-200.png)

第二种：缺失 Token 或错误 Token，统一返回 `401 Unauthorized`。

```http
GET /api/v1/health
```

或者：

```http
GET /api/v1/health
Authorization: Bearer wrong-token
```

预期响应：

```json
{
  "code": "401",
  "message": "Invalid or missing access token.",
  "traceId": "<trace-id>"
}
```

![缺失或错误 Token 返回 401 的 Apifox 截图](/img/posts/apifox-auth-401.png)

无 Token 和 Token 错误都返回同样的 `401` 响应，这是有意设计。客户端只需要知道鉴权失败，不需要知道具体是哪一种失败。

## ✦ 完整代码 (Complete Code)

下面是当前方案的核心代码。

### ✦ UnauthorizedResponse

```csharp
namespace ArturiaLink.Server.Responses;

public sealed record UnauthorizedResponse
{
    public string Code { get; set; } = "401";
    public string Message { get; set; } = "Invalid or missing access token.";
    public string TraceId { get; set; } = string.Empty;
}
```

### ✦ TokenAuthenticationHandler

```csharp
using System.Security.Claims;
using System.Text.Encodings.Web;
using ArturiaLink.Server.Responses;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace ArturiaLink.Server.Authentication;

public sealed class TokenAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    IConfiguration configuration)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "ArturiaBearer";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        string? configurationToken = configuration["Authentication:Token"];
        if (string.IsNullOrWhiteSpace(configurationToken))
            return Task.FromResult(AuthenticateResult.Fail("Authentication token is not configured."));

        if (!Request.Headers.TryGetValue("Authorization", out var authorizationValue))
            return Task.FromResult(AuthenticateResult.Fail("Authorization header is missing."));

        string authorization = authorizationValue.ToString();
        if (!authorization.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            return Task.FromResult(AuthenticateResult.Fail("Bearer token is missing."));

        string token = authorization["Bearer ".Length..].Trim();
        if (!string.Equals(token, configurationToken, StringComparison.Ordinal))
            return Task.FromResult(AuthenticateResult.Fail("Bearer token is invalid."));

        var claims = new[]
        {
            new Claim(ClaimTypes.Name, "ArturiaLinkAdmin")
        };

        var identity = new ClaimsIdentity(claims, SchemeName);
        var principal = new ClaimsPrincipal(identity);
        var ticket = new AuthenticationTicket(principal, SchemeName);

        return Task.FromResult(AuthenticateResult.Success(ticket));
    }

    protected override async Task HandleChallengeAsync(AuthenticationProperties properties)
    {
        Response.StatusCode = StatusCodes.Status401Unauthorized;
        Response.ContentType = "application/json";

        await Response.WriteAsJsonAsync(new UnauthorizedResponse
        {
            TraceId = Context.TraceIdentifier
        });
    }
}
```

### ✦ Program.cs

```csharp
using ArturiaLink.Server.Authentication;
using ArturiaLink.Server.Endpoints;
using ArturiaLink.Server.Models;
using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();

builder.Services
    .AddAuthentication(TokenAuthenticationHandler.SchemeName)
    .AddScheme<AuthenticationSchemeOptions, TokenAuthenticationHandler>(
        TokenAuthenticationHandler.SchemeName,
        options => { });

builder.Services.AddAuthorization();

var connectionString = builder.Configuration.GetConnectionString("<your-db-key>");

builder.Services.AddDbContext<ArturiaShortLinkDbContext>(options =>
{
    options.UseMySql(
        connectionString,
        ServerVersion.AutoDetect(connectionString));
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();

app.UseAuthentication();
app.UseAuthorization();

app.MapV1Endpoints();

app.Run();
```

### ✦ V1Endpoints.cs

```csharp
using ArturiaLink.Server.Responses;

namespace ArturiaLink.Server.Endpoints;

public static class V1Endpoints
{
    extension(IEndpointRouteBuilder app)
    {
        public RouteGroupBuilder MapV1Endpoints()
        {
            var group = app.MapGroup("/api/v1")
                .RequireAuthorization();

            group.MapGet("health", () => Results.Ok(new HealthResponse(true, DateTimeOffset.UtcNow)))
                .WithName("GetHealth")
                .WithTags("Health");

            return group;
        }
    }
}
```

## ✦ 总结 (Summary)

WebAPI 鉴权的核心，不是简单地在每个接口里判断 token，而是把身份认证和接口授权交给框架管线统一处理。

对于 ArturiaLink 这样的个人短链项目，单管理员 [[Bearer Token]] 足够支撑 v1.0 的需求。它比 [[JWT]]、[[OAuth2]] 更轻，代码也更容易理解。但即使是轻量方案，也应该注意几个关键点：

- 先划清需要鉴权和允许匿名访问的接口边界。
- 使用标准 `Authorization: Bearer {Token}` 请求头。
- 接入 ASP.NET Core 的 Authentication / Authorization 管线。
- 成功认证后创建带 `authenticationType` 的 `ClaimsIdentity`。
- 鉴权失败时重写 `HandleChallengeAsync` 返回统一 JSON。
- 不向客户端暴露过细的失败原因。

简单方案不等于随便写。一个清晰的鉴权边界和一套稳定的响应结构，能让项目在 v1.0 阶段保持轻量，也能为后续扩展留下空间。
