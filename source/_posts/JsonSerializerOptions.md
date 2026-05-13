---
title: 'JsonSerializerOptions: 本地 JSON 配置文件读取的推荐方案'
cover: /img/bg/jsonserializeroptions-cover.jpg
abbrlink: rwjeq522
date: 2026-05-13 10:33:14
categories:
  - .NET
tags:
  - CSharp
  - 配置文件
  - JSON序列化
glossary:
  JsonSerializerOptions:
    title: JsonSerializerOptions
    brief: 控制 JSON 序列化和反序列化行为的核心配置类
---

> ⚠️ 声明：本文中的代码尚未经过笔者的完整验证，内容是笔者最近与 AI 讨论、归纳总结 `JsonSerializerOptions` 的使用心得。如有疏漏，欢迎指正。

# C# `JsonSerializerOptions` 使用总结：本地 JSON 配置文件读取的推荐方案

在 C# 中，`System.Text.Json.JsonSerializerOptions` 是控制 JSON 序列化和反序列化行为的核心配置类。

它可以决定：

- JSON 输出是否格式化；
- 属性名是否区分大小写；
- 是否允许注释；
- 是否允许尾随逗号；
- 是否忽略 `null`；
- 如何处理循环引用；
- 如何处理数字、枚举、自定义类型等。

本文基于一个典型场景：**读取本地 JSON 配置文件**，总结 `JsonSerializerOptions` 的常见属性作用，并给出适合本地配置文件的推荐组合。

---

## ✦ 架构起点 (Architecture Origin)

`JsonSerializerOptions` 是 `System.Text.Json` 中用于配置 JSON 序列化和反序列化行为的类。

常见用法如下：

```csharp
using System.Text.Json;

var options = new JsonSerializerOptions
{
    PropertyNameCaseInsensitive = true,
    WriteIndented = true
};

var obj = JsonSerializer.Deserialize<MyConfig>(json, options);
var jsonText = JsonSerializer.Serialize(obj, options);
```

简单来说：

- `Serialize` 时，它控制 C# 对象如何变成 JSON；
- `Deserialize` 时，它控制 JSON 如何变成 C# 对象。

---

## ✦ 常见属性分类说明 (Property Classification)

### 1. 格式化与输出控制

这类属性主要影响生成 JSON 字符串的格式。

#### `WriteIndented`

是否格式化输出 JSON。

默认值是 `false`。

```csharp
var options = new JsonSerializerOptions
{
    WriteIndented = true
};
```

如果为 `false`，输出结果通常是一行：

```json
{"name":"张三","age":18}
```

如果为 `true`，输出结果会带缩进：

```json
{
  "name": "张三",
  "age": 18
}
```

**什么时候使用？**

适合：

- 本地配置文件；
- 日志文件；
- 调试输出；
- 需要人工阅读的 JSON。

不太适合：

- 网络接口高频传输；
- 对体积特别敏感的场景。

对于本地配置文件，建议开启：

```csharp
WriteIndented = true
```

---

#### `Encoder`

用于控制字符串中的字符如何转义。

默认情况下，`System.Text.Json` 可能会把中文转成 Unicode 转义形式，例如：

```json
{
  "name": "\u5F20\u4E09"
}
```

如果希望中文原样输出，可以设置：

```csharp
using System.Text.Encodings.Web;

var options = new JsonSerializerOptions
{
    Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
};
```

输出效果：

```json
{
  "name": "张三"
}
```

**什么时候使用？**

适合：

- 本地配置文件；
- 中文日志；
- 希望 JSON 文件可读性更好的场景。

需要注意的是，`UnsafeRelaxedJsonEscaping` 名字里带有 `Unsafe`，主要是因为它放宽了某些 HTML 相关字符的转义规则。

如果 JSON 会被直接嵌入 HTML 页面中，需要谨慎使用。

但对于本地配置文件，一般可以放心使用。

---

### 2. 命名策略与大小写控制

这类属性用于处理 JSON 字段名和 C# 属性名之间的匹配关系。

---

#### `PropertyNameCaseInsensitive`

反序列化时，属性名是否忽略大小写。

默认值是 `false`。

例如 C# 类：

```csharp
public class AppConfig
{
    public string SystemName { get; set; }
}
```

JSON 文件：

```json
{
  "systemName": "仓储管理系统"
}
```

如果设置：

```csharp
PropertyNameCaseInsensitive = true
```

那么 `"systemName"` 可以正确匹配到 `SystemName`。

**什么时候使用？**

适合：

- 本地配置文件；
- 第三方 JSON；
- 前后端命名风格不完全一致；
- 希望配置文件对大小写不敏感。

对于本地配置文件，强烈推荐开启：

```csharp
PropertyNameCaseInsensitive = true
```

需要注意的是，它只是不区分大小写。

例如下面这种情况不能仅靠它解决：

```json
{
  "system_name": "仓储管理系统"
}
```

这个字段名是 `snake_case`，而 C# 是 `SystemName`，两者不只是大小写不同。

这种情况需要使用：

```csharp
PropertyNamingPolicy
```

或者给属性加：

```csharp
[JsonPropertyName("system_name")]
```

---

#### `PropertyNamingPolicy`

控制序列化时 C# 属性名如何转换成 JSON 属性名。

例如：

```csharp
var options = new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase
};
```

C#：

```csharp
public string SystemName { get; set; }
```

输出 JSON：

```json
{
  "systemName": "仓储管理系统"
}
```

**什么时候使用？**

适合：

- Web API；
- 前端习惯使用 camelCase 的接口；
- 希望 JSON 字段统一小驼峰命名。

对于本地配置文件，如果只是读取配置，通常不一定需要设置。

如果你的配置文件统一要求使用小驼峰命名，可以设置：

```csharp
PropertyNamingPolicy = JsonNamingPolicy.CamelCase
```

---

#### `DictionaryKeyPolicy`

用于控制字典类型的 key 如何转换。

例如：

```csharp
Dictionary<string, string> dict = new()
{
    ["SystemName"] = "仓储管理系统"
};
```

如果设置：

```csharp
DictionaryKeyPolicy = JsonNamingPolicy.CamelCase
```

序列化后：

```json
{
  "systemName": "仓储管理系统"
}
```

**什么时候使用？**

适合字典 key 也需要统一命名风格的场景。

本地配置文件一般不一定需要设置。

---

### 3. 包含与忽略规则

这类属性决定哪些属性会被写入 JSON。

---

#### `DefaultIgnoreCondition`

控制序列化时忽略哪些默认值。

常见值：

```csharp
JsonIgnoreCondition.Never
JsonIgnoreCondition.WhenWritingNull
JsonIgnoreCondition.WhenWritingDefault
```

示例：

```csharp
var options = new JsonSerializerOptions
{
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
};
```

如果对象中某个属性为 `null`，则不会输出到 JSON。

```csharp
public class AppConfig
{
    public string Name { get; set; }
    public string Description { get; set; }
}
```

对象：

```csharp
var config = new AppConfig
{
    Name = "系统配置",
    Description = null
};
```

输出：

```json
{
  "name": "系统配置"
}
```

**什么时候使用？**

适合：

- Web API 减少响应体积；
- 不希望输出 `null` 的场景。

对于本地配置文件，需要谨慎。

如果你希望配置文件尽可能完整，建议不要忽略 `null`。

如果你希望配置文件更简洁，可以使用：

```csharp
DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
```

---

#### `IncludeFields`

默认情况下，`System.Text.Json` 只处理属性，不处理字段。

例如：

```csharp
public class AppConfig
{
    public string SystemName;
}
```

上面这个是字段，不是属性。

默认情况下不会被序列化或反序列化。

如果想支持字段，需要：

```csharp
var options = new JsonSerializerOptions
{
    IncludeFields = true
};
```

**什么时候使用？**

适合：

- 你的配置类使用了 public 字段；
- 老项目里 DTO 不是属性而是字段。

更推荐的方式是使用属性：

```csharp
public string SystemName { get; set; }
```

对于本地配置文件，除非你确实使用 public 字段，否则不建议开启。

---

#### `IgnoreReadOnlyProperties`

是否忽略只读属性。

```csharp
public class AppConfig
{
    public string SystemName { get; set; }

    public string DisplayName => $"系统：{SystemName}";
}
```

`DisplayName` 是只读属性。

如果设置：

```csharp
IgnoreReadOnlyProperties = true
```

序列化时会忽略它。

**什么时候使用？**

适合：

- 不希望把计算属性写入 JSON；
- 配置文件只保存真正需要配置的值。

对于本地配置文件，可以考虑开启：

```csharp
IgnoreReadOnlyProperties = true
```

---

### 4. 宽容解析：本地配置文件最重要的一类配置

本地配置文件通常由人手动编辑。

人工编辑 JSON 时很容易出现：

- 加注释；
- 多写一个逗号；
- 大小写不一致；
- 数字写成字符串。

所以，本地配置文件读取时通常需要更高的容错性。

---

#### `ReadCommentHandling`

控制如何处理 JSON 中的注释。

JSON 标准本身不支持注释，但配置文件中经常需要注释：

```json
{
  // 系统名称
  "systemName": "仓储管理系统"
}
```

默认情况下，`System.Text.Json` 遇到注释会报错。

如果设置：

```csharp
ReadCommentHandling = JsonCommentHandling.Skip
```

则会跳过注释。

**什么时候使用？**

非常适合本地配置文件。

强烈推荐：

```csharp
ReadCommentHandling = JsonCommentHandling.Skip
```

---

#### `AllowTrailingCommas`

是否允许尾随逗号。

例如：

```json
{
  "systemName": "仓储管理系统",
  "enableLogging": true,
}
```

最后一项后面多了一个逗号。

标准 JSON 不允许这种写法，但人手动编辑配置文件时很常见。

设置：

```csharp
AllowTrailingCommas = true
```

即可允许这种格式。

**什么时候使用？**

非常适合本地配置文件。

强烈推荐：

```csharp
AllowTrailingCommas = true
```

---

#### `NumberHandling`

控制数字与字符串之间是否可以宽松转换。

例如配置文件中写了：

```json
{
  "port": "8080"
}
```

但 C# 类是：

```csharp
public class AppConfig
{
    public int Port { get; set; }
}
```

默认情况下，字符串 `"8080"` 不能直接反序列化成 `int`。

可以设置：

```csharp
using System.Text.Json.Serialization;

var options = new JsonSerializerOptions
{
    NumberHandling = JsonNumberHandling.AllowReadingFromString
};
```

这样 `"8080"` 就可以读成整数 `8080`。

**什么时候使用？**

适合：

- 第三方 JSON 不规范；
- 配置文件中用户可能把数字加上引号；
- 想提高配置文件容错能力。

对于本地配置文件，可以按需开启：

```csharp
NumberHandling = JsonNumberHandling.AllowReadingFromString
```

如果你希望严格要求配置格式，则不要开启。

---

### 5. 对象深度、循环引用与高级配置

---

#### `MaxDepth`

控制 JSON 最大嵌套深度。

默认值通常已经够用。

例如：

```csharp
var options = new JsonSerializerOptions
{
    MaxDepth = 64
};
```

**什么时候使用？**

适合：

- 防止恶意构造的超深 JSON；
- 限制配置文件复杂度。

普通本地配置文件一般不需要修改。

---

#### `ReferenceHandler`

用于处理对象循环引用。

例如 A 引用 B，B 又引用 A。

常见配置：

```csharp
ReferenceHandler = ReferenceHandler.IgnoreCycles
```

或者：

```csharp
ReferenceHandler = ReferenceHandler.Preserve
```

**什么时候使用？**

适合：

- Entity Framework Core 实体；
- 对象图中存在双向引用；
- 复杂对象序列化。

本地配置文件一般不需要设置。

配置类应该尽量设计成简单的树形结构，不建议出现循环引用。

---

#### `Converters`

用于注册自定义转换器。

例如：

- 自定义日期格式；
- 枚举字符串转换；
- 特殊类型转换；
- 加密字段转换；
- 自定义配置项格式。

示例：

```csharp
var options = new JsonSerializerOptions
{
    Converters =
    {
        new JsonStringEnumConverter()
    }
};
```

这样枚举可以用字符串形式读写：

```json
{
  "logLevel": "Debug"
}
```

而不是：

```json
{
  "logLevel": 1
}
```

**什么时候使用？**

本地配置文件中非常常见的一个场景是枚举。

如果配置类中有枚举，推荐添加：

```csharp
Converters.Add(new JsonStringEnumConverter());
```

这样配置文件更容易阅读和维护。

---

## ✦ 本地配置文件读取的推荐组合 (Recommended Combination)

对于本地 JSON 配置文件，最核心的目标是：

1. 允许注释；
2. 允许尾随逗号；
3. 属性名大小写不敏感；
4. 输出格式便于人类阅读；
5. 中文正常显示；
6. 可选支持数字字符串和枚举字符串。

推荐配置如下：

```csharp
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;

public static class JsonConfigHelper
{
    public static readonly JsonSerializerOptions LocalConfigOptions = new JsonSerializerOptions
    {
        // 允许 JSON 中写注释
        ReadCommentHandling = JsonCommentHandling.Skip,

        // 允许最后一个属性或数组元素后面多一个逗号
        AllowTrailingCommas = true,

        // 反序列化时属性名忽略大小写
        PropertyNameCaseInsensitive = true,

        // 写回配置文件时格式化输出
        WriteIndented = true,

        // 中文不转义，增强可读性
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,

        // 允许数字以字符串形式读取，例如 "8080" 读取为 int
        NumberHandling = JsonNumberHandling.AllowReadingFromString,

        // 忽略只读属性，避免把计算属性写入配置文件
        IgnoreReadOnlyProperties = true
    };

    static JsonConfigHelper()
    {
        // 枚举使用字符串形式读写
        LocalConfigOptions.Converters.Add(new JsonStringEnumConverter());
    }
}
```

---

## ✦ 完整示例 (Complete Example)

### 1. 配置文件 `config.json`

```json
{
  // 系统名称
  "systemName": "仓储管理系统",

  /*
    数据库配置
    timeout 可以写数字，也可以写字符串
  */
  "database": {
    "connectionString": "Server=localhost;Database=Demo;Uid=root;Pwd=123456;",
    "timeout": "30",
  },

  // 是否开启日志
  "enableLogging": true,

  // 日志等级，使用枚举字符串
  "logLevel": "Debug",
}
```

这个 JSON 中包含：

- 单行注释；
- 多行注释；
- 尾随逗号；
- 小驼峰字段名；
- 字符串形式的数字；
- 字符串形式的枚举。

使用默认 `JsonSerializerOptions` 读取时可能会报错。

使用上面的 `LocalConfigOptions` 可以正常读取。

---

### 2. C# 配置类

```csharp
public class AppConfig
{
    public string SystemName { get; set; } = string.Empty;

    public DatabaseConfig Database { get; set; } = new();

    public bool EnableLogging { get; set; }

    public LogLevel LogLevel { get; set; }
}

public class DatabaseConfig
{
    public string ConnectionString { get; set; } = string.Empty;

    public int Timeout { get; set; }
}

public enum LogLevel
{
    Trace,
    Debug,
    Information,
    Warning,
    Error,
    Critical
}
```

---

### 3. 读取配置文件

```csharp
using System.Text.Json;

string json = File.ReadAllText("config.json");

AppConfig? config = JsonSerializer.Deserialize<AppConfig>(
    json,
    JsonConfigHelper.LocalConfigOptions
);

if (config is null)
{
    throw new InvalidOperationException("配置文件读取失败。");
}

Console.WriteLine(config.SystemName);
Console.WriteLine(config.Database.ConnectionString);
Console.WriteLine(config.Database.Timeout);
Console.WriteLine(config.LogLevel);
```

输出：

```text
仓储管理系统
Server=localhost;Database=Demo;Uid=root;Pwd=123456;
30
Debug
```

---

### 4. 写回配置文件

如果程序修改了配置，也可以写回本地文件：

```csharp
config.EnableLogging = false;

string newJson = JsonSerializer.Serialize(
    config,
    JsonConfigHelper.LocalConfigOptions
);

File.WriteAllText("config.json", newJson);
```

输出结果类似：

```json
{
  "SystemName": "仓储管理系统",
  "Database": {
    "ConnectionString": "Server=localhost;Database=Demo;Uid=root;Pwd=123456;",
    "Timeout": 30
  },
  "EnableLogging": false,
  "LogLevel": "Debug"
}
```

需要注意：
`System.Text.Json` 在反序列化后再序列化时，**不会保留原文件中的注释**。

也就是说，如果你读取一个带注释的 JSON 文件，再写回去，原来的注释会丢失。

如果你需要完整保留注释、空行、格式等信息，就需要使用专门支持 JSON 编辑的库，或者自己设计配置更新逻辑。

---

## ✦ 本地配置文件推荐配置总结 (Summary)

对于读取本地配置文件，最推荐的三个配置是：

```csharp
ReadCommentHandling = JsonCommentHandling.Skip;
AllowTrailingCommas = true;
PropertyNameCaseInsensitive = true;
```

这三个可以称为本地配置文件读取的"黄金三角"。

它们分别解决：

| 配置项 | 作用 |
|---|---|
| `ReadCommentHandling = JsonCommentHandling.Skip` | 允许配置文件中写注释 |
| `AllowTrailingCommas = true` | 允许最后多一个逗号 |
| `PropertyNameCaseInsensitive = true` | 属性名大小写不敏感 |

如果还需要写回配置文件，建议额外加上：

```csharp
WriteIndented = true;
Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping;
```

如果希望配置文件更宽容，可以加上：

```csharp
NumberHandling = JsonNumberHandling.AllowReadingFromString;
```

如果有枚举配置项，建议加上：

```csharp
Converters.Add(new JsonStringEnumConverter());
```

---

## ✦ 最终推荐版本 (Final Recommended Version)

如果你的目标是读取和写入本地配置文件，可以使用下面这个版本：

```csharp
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;

public static class JsonConfigOptions
{
    public static readonly JsonSerializerOptions Options = CreateOptions();

    private static JsonSerializerOptions CreateOptions()
    {
        var options = new JsonSerializerOptions
        {
            ReadCommentHandling = JsonCommentHandling.Skip,
            AllowTrailingCommas = true,
            PropertyNameCaseInsensitive = true,
            WriteIndented = true,
            Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
            NumberHandling = JsonNumberHandling.AllowReadingFromString,
            IgnoreReadOnlyProperties = true
        };

        options.Converters.Add(new JsonStringEnumConverter());

        return options;
    }
}
```

使用方式：

```csharp
string json = File.ReadAllText("config.json");

AppConfig? config = JsonSerializer.Deserialize<AppConfig>(
    json,
    JsonConfigOptions.Options
);
```

---

## ✦ 结论 (Conclusion)

`JsonSerializerOptions` 是 `System.Text.Json` 中非常重要的配置类。

对于 Web API、日志、缓存、第三方接口和本地配置文件，不同场景应该使用不同的组合。

如果你的目标是**读取本地配置文件**，推荐重点关注：

```csharp
ReadCommentHandling
AllowTrailingCommas
PropertyNameCaseInsensitive
WriteIndented
Encoder
NumberHandling
Converters
```

其中最核心的是：

```csharp
ReadCommentHandling = JsonCommentHandling.Skip;
AllowTrailingCommas = true;
PropertyNameCaseInsensitive = true;
```

这套配置可以让 JSON 配置文件更接近人工可维护的格式，减少因为注释、大小写或多余逗号导致的读取失败问题。

---

**参考链接**

- [System.Text.Json.JsonSerializerOptions 官方文档](https://learn.microsoft.com/zh-cn/dotnet/api/system.text.json.jsonserializeroptions?view=net-8.0)
