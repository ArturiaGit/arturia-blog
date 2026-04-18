---
title: 'Exchange: RabbitMQ 四种交换器类型详解'
cover: /img/bg/exchange-cover.webp
abbrlink: k8m2n9pq
date: 2026-04-09 22:21:18
categories:
  - RabbitMQ
tags:
  - RabbitMQ
  - 消息队列
  - Exchange
glossary:
  Exchange:
    title: 交换器
    brief: RabbitMQ 的核心路由组件,负责接收生产者消息并根据路由规则分发到队列
  RoutingKey:
    title: 路由键
    brief: 消息的路由标识,交换器根据 RoutingKey 决定消息投递方向
  BindingKey:
    title: 绑定键
    brief: 队列与交换器绑定时的标识,用于匹配 RoutingKey
  fanout:
    title: fanout 交换器
    brief: 扇出型交换器,无视 RoutingKey,将消息广播至所有绑定队列
  direct:
    title: direct 交换器
    brief: 直连型交换器,精确匹配 RoutingKey 与 BindingKey
  topic:
    title: topic 交换器
    brief: 主题型交换器,支持通配符模糊匹配 RoutingKey
  headers:
    title: headers 交换器
    brief: 头部型交换器,基于消息 headers 属性进行匹配,性能较差
  队列:
    title: 队列
    brief: RabbitMQ 存储消息的容器,消费者从队列中获取消息
---

在 [[RabbitMQ]] 的消息路由体系中,[[Exchange]] 是承上启下的核心枢纽。它不存储消息,只负责路由——接收生产者投递的消息,根据路由规则分发到下游的 [[队列]]。

如果把 RabbitMQ 比作一个邮局分拣中心,[[Exchange]] 就是分拣员。每天,海量的信件(消息)涌入分拣中心,分拣员需要根据信封上的地址信息,将信件投递到正确的邮箱(队列)中。

本文将逐一拆解 RabbitMQ 的四种 [[Exchange]] 类型:[[fanout]]、[[direct]]、[[topic]]、[[headers]]。

## ✦ fanout:扇出广播

### ✦ 生活类比:小区大喇叭

物业工作人员拿着大喇叭站在小区广场喊话:"所有人注意啦,明天停水!"不管你是住 1 号楼还是 2 号楼,不管你是业主还是租户,只要你在小区里(绑定了这个交换器),你都能听到这条消息。

### ✦ 路由规则

[[fanout]] 交换器是四种类型中最简单直接的一种。它完全无视消息的 [[RoutingKey]],收到消息后立即复制 N 份,转发给所有与之绑定的队列。

这种"简单粗暴"的广播模式,在特定场景下反而效率最高——省去了复杂的路由计算。

### ✦ 生产者代码

```csharp
using System.Text;
using RabbitMQ.Client;

// 1. 创建连接工厂与配置
ConnectionFactory factory = new ConnectionFactory
{
    HostName = "mq.example.com",
    VirtualHost = "/",
    Password = "your_password",
    UserName = "your_username",
    Port = 5671,
    Ssl = new SslOption { Enabled = true, ServerName = "mq.example.com" }
};

// 2. 建立连接与信道
await using var connection = await factory.CreateConnectionAsync();
await using var channel = await connection.CreateChannelAsync();

// 3. 声明一个 Fanout 类型的交换器
// durable: true 表示交换器持久化，服务器重启不丢失
const string exchangeName = "my_fanout_exchange";
await channel.ExchangeDeclareAsync(exchangeName, ExchangeType.Fanout, durable: true);

// 4. 准备消息体（必须为二进制格式）
const string message = "系统公告：明天凌晨 02:00 进行服务器维护";
var body = Encoding.UTF8.GetBytes(message);

// 5. 发送消息
// 注意：Fanout 类型会忽略 RoutingKey，消息广播到所有绑定队列
await channel.BasicPublishAsync(exchange: exchangeName, routingKey: string.Empty, body: body);

Console.WriteLine($"[x] 已广播消息：{message}");
Console.WriteLine("[x] 按任意键退出...");
Console.ReadKey();
```

### ✦ 消费者代码

```csharp
using System.Text;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;

// 1. 创建连接工厂与配置
ConnectionFactory factory = new ConnectionFactory
{
    HostName = "mq.example.com",
    VirtualHost = "/",
    Password = "your_password",
    UserName = "your_username",
    Port = 5671,
    Ssl = new SslOption { Enabled = true, ServerName = "mq.example.com" }
};

// 2. 建立连接与信道
await using var connection = await factory.CreateConnectionAsync();
await using var channel = await connection.CreateChannelAsync();

// 3. 声明交换器（确保交换器存在）
const string exchangeName = "my_fanout_exchange";
await channel.ExchangeDeclareAsync(exchangeName, ExchangeType.Fanout, durable: true);

// 4. 声明临时队列（exclusive: true 表示连接断开后自动删除）
// 每个消费者都会获得一个唯一的队列名
var queueDeclareResult = await channel.QueueDeclareAsync(
    queue: string.Empty,
    durable: false,
    exclusive: true,
    autoDelete: true);

var queueName = queueDeclareResult.QueueName;
Console.WriteLine($"[x] 消费者队列已创建：{queueName}");

// 5. 将队列绑定到交换器
// Fanout 类型忽略 RoutingKey，绑定时的 routingKey 可以为空
await channel.QueueBindAsync(queue: queueName, exchange: exchangeName, routingKey: string.Empty);

// 6. 创建异步消费者
var consumer = new AsyncEventingBasicConsumer(channel);
consumer.ReceivedAsync += async (model, ea) =>
{
    var body = ea.Body.ToArray();
    var message = Encoding.UTF8.GetString(body);
    Console.WriteLine($"[x] 收到广播消息：{message}");
    await Task.CompletedTask;
};

// 7. 启动消费者
// autoAck: true 表示消息投递后自动确认
await channel.BasicConsumeAsync(queue: queueName, autoAck: true, consumer: consumer);

Console.WriteLine("[x] 等待广播消息，按任意键退出...");
Console.ReadKey();
```

### ✦ 典型场景

- 群发系统公告
- 配置热更新广播
- 实时日志流分发
- 缓存失效通知

## ✦ direct:精确直连

### ✦ 生活类比:挂号信

你寄了一封挂号信,信封上写着"收件人:张三,房间号:101"。分拣员拿着信,去核对小区里的信箱标签。只有贴着"张三,101"标签的信箱,这封信才会被投进去。其他的信箱,哪怕只差一个字(比如"张三,102"),都收不到。

### ✦ 路由规则

[[direct]] 交换器执行精确匹配。消息的 [[RoutingKey]] 必须与队列的 [[BindingKey]] 完全一致(字符串相等),消息才会被路由到该队列。

这种严格匹配机制,确保了消息投递的精确性。

### ✦ 生产者代码

```csharp
using System.Text;
using RabbitMQ.Client;

// 1. 创建连接工厂与配置
ConnectionFactory factory = new ConnectionFactory
{
    HostName = "mq.example.com",
    VirtualHost = "/",
    Password = "your_password",
    UserName = "your_username",
    Port = 5671,
    Ssl = new SslOption { Enabled = true, ServerName = "mq.example.com" }
};

// 2. 建立连接与信道
await using var connection = await factory.CreateConnectionAsync();
await using var channel = await connection.CreateChannelAsync();

// 3. 声明一个 Direct 类型的交换器
// durable: true 表示交换器持久化，服务器重启不丢失
const string exchangeName = "my_direct_exchange";
await channel.ExchangeDeclareAsync(exchangeName, ExchangeType.Direct, durable: true);

// 4. 准备消息体（必须为二进制格式）
const string message = "数据库连接失败，请检查连接字符串";
var body = Encoding.UTF8.GetBytes(message);

// 5. 发送消息并打上 RoutingKey 标签
// 只有绑定了 "error" RoutingKey 的队列才会收到此消息
const string routingKey = "error";
await channel.BasicPublishAsync(exchange: exchangeName, routingKey: routingKey, body: body);

Console.WriteLine($"[x] 已发送错误日志：{message}");
Console.WriteLine($"[x] 路由键：{routingKey}");
Console.WriteLine("[x] 按任意键退出...");
Console.ReadKey();
```

### ✦ 消费者代码

```csharp
using System.Text;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;

// 1. 创建连接工厂与配置
ConnectionFactory factory = new ConnectionFactory
{
    HostName = "mq.example.com",
    VirtualHost = "/",
    Password = "your_password",
    UserName = "your_username",
    Port = 5671,
    Ssl = new SslOption { Enabled = true, ServerName = "mq.example.com" }
};

// 2. 建立连接与信道
await using var connection = await factory.CreateConnectionAsync();
await using var channel = await connection.CreateChannelAsync();

// 3. 声明交换器（确保交换器存在）
const string exchangeName = "my_direct_exchange";
await channel.ExchangeDeclareAsync(exchangeName, ExchangeType.Direct, durable: true);

// 4. 声明队列
const string queueName = "error_log_queue";
await channel.QueueDeclareAsync(
    queue: queueName,
    durable: true,
    exclusive: false,
    autoDelete: false);

// 5. 将队列绑定到交换器，并指定 BindingKey
// 此队列只接收 RoutingKey 为 "error" 的消息
await channel.QueueBindAsync(queue: queueName, exchange: exchangeName, routingKey: "error");

Console.WriteLine($"[x] 队列 {queueName} 已绑定到交换器，监听 RoutingKey: error");

// 6. 创建异步消费者
var consumer = new AsyncEventingBasicConsumer(channel);
consumer.ReceivedAsync += async (model, ea) =>
{
    var body = ea.Body.ToArray();
    var message = Encoding.UTF8.GetString(body);
    var routingKey = ea.RoutingKey;
    Console.WriteLine($"[x] 收到消息 [RoutingKey={routingKey}]：{message}");
    await Task.CompletedTask;
};

// 7. 启动消费者
// autoAck: true 表示消息投递后自动确认
await channel.BasicConsumeAsync(queue: queueName, autoAck: true, consumer: consumer);

Console.WriteLine("[x] 等待消息，按任意键退出...");
Console.ReadKey();
```

### ✦ 典型场景

- 点对点消息投递
- 根据日志级别过滤
- 任务分发(按任务类型路由)
- 用户通知(按用户 ID 精准投递)

## ✦ topic:主题匹配

### ✦ 生活类比:订阅报纸

你去邮局订阅报纸:

- 小王说:"我要订所有关于体育的报纸。"([[BindingKey]]:`*.sport.#`)
- 小李说:"我要订所有关于美国的报纸。"([[BindingKey]]:`usa.#`)
- 小张说:"我要订所有美国体育的报纸。"([[BindingKey]]:`usa.sport.*`)

当邮局收到一份报纸,标题是 `usa.sport.football`(美国体育足球):

- 小王收到(匹配体育)
- 小李收到(匹配美国)
- 小张收到(匹配美国体育)

### ✦ 路由规则

[[topic]] 交换器支持模糊匹配。[[RoutingKey]] 和 [[BindingKey]] 必须是由点号 `.` 分隔的单词列表(如 `user.order.create`)。交换器使用两个特殊的通配符进行匹配:

| 通配符 | 匹配规则 | 示例 |
|--------|----------|------|
| `*` (星号) | 匹配一个单词 | `user.*` 匹配 `user.login`,但不匹配 `user.order.create` |
| `#` (井号) | 匹配零个或多个单词 | `user.#` 匹配 `user.login`、`user.order.create`,甚至只匹配 `user` |

这种灵活的模式匹配机制,非常适合多维度、多层级的业务分类。

### ✦ 生产者代码

```csharp
using System.Text;
using RabbitMQ.Client;

// 1. 创建连接工厂与配置
ConnectionFactory factory = new ConnectionFactory
{
    HostName = "mq.example.com",
    VirtualHost = "/",
    Password = "your_password",
    UserName = "your_username",
    Port = 5671,
    Ssl = new SslOption { Enabled = true, ServerName = "mq.example.com" }
};

// 2. 建立连接与信道
await using var connection = await factory.CreateConnectionAsync();
await using var channel = await connection.CreateChannelAsync();

// 3. 声明一个 Topic 类型的交换器
// durable: true 表示交换器持久化，服务器重启不丢失
const string exchangeName = "my_topic_exchange";
await channel.ExchangeDeclareAsync(exchangeName, ExchangeType.Topic, durable: true);

// 4. 准备消息体（必须为二进制格式）
const string message = "美国 NFL 超级碗决赛即将开始";
var body = Encoding.UTF8.GetBytes(message);

// 5. 发送消息并打上 RoutingKey 标签
// RoutingKey 格式：国家.类别.子类别
const string routingKey = "usa.sport.football";
await channel.BasicPublishAsync(exchange: exchangeName, routingKey: routingKey, body: body);

Console.WriteLine($"[x] 已发送消息：{message}");
Console.WriteLine($"[x] 路由键：{routingKey}");
Console.WriteLine("[x] 按任意键退出...");
Console.ReadKey();
```

### ✦ 消费者代码

```csharp
using System.Text;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;

// 1. 创建连接工厂与配置
ConnectionFactory factory = new ConnectionFactory
{
    HostName = "mq.example.com",
    VirtualHost = "/",
    Password = "your_password",
    UserName = "your_username",
    Port = 5671,
    Ssl = new SslOption { Enabled = true, ServerName = "mq.example.com" }
};

// 2. 建立连接与信道
await using var connection = await factory.CreateConnectionAsync();
await using var channel = await connection.CreateChannelAsync();

// 3. 声明交换器（确保交换器存在）
const string exchangeName = "my_topic_exchange";
await channel.ExchangeDeclareAsync(exchangeName, ExchangeType.Topic, durable: true);

// 4. 声明队列
const string queueName = "sport_news_queue";
await channel.QueueDeclareAsync(
    queue: queueName,
    durable: true,
    exclusive: false,
    autoDelete: false);

// 5. 将队列绑定到交换器，使用通配符模式
// *.sport.# 匹配所有体育相关消息（任意国家.体育.任意子类别）
const string bindingKey = "*.sport.#";
await channel.QueueBindAsync(queue: queueName, exchange: exchangeName, routingKey: bindingKey);

Console.WriteLine($"[x] 队列 {queueName} 已绑定到交换器，监听模式：{bindingKey}");

// 6. 创建异步消费者
var consumer = new AsyncEventingBasicConsumer(channel);
consumer.ReceivedAsync += async (model, ea) =>
{
    var body = ea.Body.ToArray();
    var message = Encoding.UTF8.GetString(body);
    var routingKey = ea.RoutingKey;
    Console.WriteLine($"[x] 收到消息 [RoutingKey={routingKey}]：{message}");
    await Task.CompletedTask;
};

// 7. 启动消费者
// autoAck: true 表示消息投递后自动确认
await channel.BasicConsumeAsync(queue: queueName, autoAck: true, consumer: consumer);

Console.WriteLine("[x] 等待消息，按任意键退出...");
Console.ReadKey();
```

### ✦ 典型场景

- 复杂业务消息分类(按模块、按操作类型)
- 多维度日志收集(按服务、按级别、按环境)
- 分布式事件总线
- IoT 设备消息路由(按设备类型、地域、状态)

## ✦ headers:头部匹配

### ✦ 生活类比:填表审查

这是一种非常官僚的投递方式。分拣员不看信封上的地址,而是让你填一张表格,表格里有"身高"、"体重"、"年龄"等栏目。只有当信件表格里的数据与信箱要求的表格数据完全一致(或满足特定条件)时,信件才会被投递。

### ✦ 路由规则

[[headers]] 交换器忽略 [[RoutingKey]],转而对比消息的 `headers` 属性(键值对)。它可以设置 `x-match` 参数:

- `x-match: all`:所有 header 键值对都必须匹配
- `x-match: any`:只要有一个 header 键值对匹配即可

### ✦ 生产者代码

```csharp
using System.Text;
using RabbitMQ.Client;

// 1. 创建连接工厂与配置
ConnectionFactory factory = new ConnectionFactory
{
    HostName = "mq.example.com",
    VirtualHost = "/",
    Password = "your_password",
    UserName = "your_username",
    Port = 5671,
    Ssl = new SslOption { Enabled = true, ServerName = "mq.example.com" }
};

// 2. 建立连接与信道
await using var connection = await factory.CreateConnectionAsync();
await using var channel = await connection.CreateChannelAsync();

// 3. 声明一个 Headers 类型的交换器
// durable: true 表示交换器持久化，服务器重启不丢失
const string exchangeName = "my_headers_exchange";
await channel.ExchangeDeclareAsync(exchangeName, ExchangeType.Headers, durable: true);

// 4. 准备消息体（必须为二进制格式）
const string message = "这是一份 PDF 格式的财务报告";
var body = Encoding.UTF8.GetBytes(message);

// 5. 设置消息 headers 属性
var headers = new Dictionary<string, object?>
{
    ["format"] = "pdf",
    ["type"] = "report",
    ["department"] = "finance"
};

// 6. 发送消息
// Headers 交换器忽略 RoutingKey，根据 headers 属性进行匹配
var properties = new BasicProperties
{
    Headers = headers
};
await channel.BasicPublishAsync(
    exchange: exchangeName,
    routingKey: string.Empty,
    mandatory: false,
    basicProperties: properties,
    body: body);

Console.WriteLine($"[x] 已发送消息：{message}");
Console.WriteLine($"[x] Headers: format=pdf, type=report, department=finance");
Console.WriteLine("[x] 按任意键退出...");
Console.ReadKey();
```

### ✦ 消费者代码

```csharp
using System.Text;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;

// 1. 创建连接工厂与配置
ConnectionFactory factory = new ConnectionFactory
{
    HostName = "mq.example.com",
    VirtualHost = "/",
    Password = "your_password",
    UserName = "your_username",
    Port = 5671,
    Ssl = new SslOption { Enabled = true, ServerName = "mq.example.com" }
};

// 2. 建立连接与信道
await using var connection = await factory.CreateConnectionAsync();
await using var channel = await connection.CreateChannelAsync();

// 3. 声明交换器（确保交换器存在）
const string exchangeName = "my_headers_exchange";
await channel.ExchangeDeclareAsync(exchangeName, ExchangeType.Headers, durable: true);

// 4. 声明队列
const string queueName = "pdf_report_queue";
await channel.QueueDeclareAsync(
    queue: queueName,
    durable: true,
    exclusive: false,
    autoDelete: false);

// 5. 将队列绑定到交换器，设置 headers 匹配条件
// x-match: all 表示所有 header 都必须匹配
await channel.QueueBindAsync(
    queue: queueName,
    exchange: exchangeName,
    routingKey: string.Empty,
    arguments: new Dictionary<string, object?>
    {
        ["x-match"] = "all",
        ["format"] = "pdf",
        ["type"] = "report"
    });

Console.WriteLine($"[x] 队列 {queueName} 已绑定到交换器");
Console.WriteLine($"[x] 匹配条件：x-match=all, format=pdf, type=report");

// 6. 创建异步消费者
var consumer = new AsyncEventingBasicConsumer(channel);
consumer.ReceivedAsync += async (model, ea) =>
{
    var body = ea.Body.ToArray();
    var message = Encoding.UTF8.GetString(body);
    
    // 打印消息的 headers
    if (ea.BasicProperties.Headers != null)
    {
        Console.WriteLine("[x] 消息 Headers:");
        foreach (var header in ea.BasicProperties.Headers)
        {
            var value = header.Value is byte[] bytes 
                ? Encoding.UTF8.GetString(bytes) 
                : header.Value?.ToString();
            Console.WriteLine($"    {header.Key}: {value}");
        }
    }
    
    Console.WriteLine($"[x] 收到消息：{message}");
    await Task.CompletedTask;
};

// 7. 启动消费者
// autoAck: true 表示消息投递后自动确认
await channel.BasicConsumeAsync(queue: queueName, autoAck: true, consumer: consumer);

Console.WriteLine("[x] 等待消息，按任意键退出...");
Console.ReadKey();
```

### ✦ 典型场景

[[headers]] 交换器在实际工程中极少使用,主要因为:

- 性能较差(需要解析并匹配复杂的键值对)
- 配置繁琐
- 调试困难

仅在极少数需要基于复杂元数据进行过滤的场景中出现,了解即可。

## ✦ 四种交换器对比

| 类型 | 匹配方式 | 性能 | 典型场景 |
|------|----------|------|----------|
| fanout | 无视 RoutingKey,广播 | 最高 | 公告广播、配置更新 |
| direct | RoutingKey 精确匹配 | 高 | 点对点消息、日志级别过滤 |
| topic | RoutingKey 模式匹配 | 中 | 多维度分类、事件总线 |
| headers | headers 键值对匹配 | 低 | 复杂元数据过滤(极少用) |

## ✦ 星轨总结

在数字领地的消息流转架构中,[[Exchange]] 是路由决策的大脑。选择合适的交换器类型,直接影响消息投递的精确性与系统性能:

- 需要广播?选 [[fanout]]
- 需要精准投递?选 [[direct]]
- 需要灵活分类?选 [[topic]]
- 需要复杂元数据过滤?慎用 [[headers]]

理解这四种交换器的底层逻辑,才能在架构设计中做出正确的技术选型。