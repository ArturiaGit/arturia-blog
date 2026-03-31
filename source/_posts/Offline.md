---
title: 'Offline: CentOS 9 纯离线安装 v2rayA + Xray 核心全配置指南'
cover: /img/bg/offline-cover.webp
abbrlink: n3k7p2qz
date: 2026-04-01 14:58:20
categories:
  - 随笔
tags:
  - CentOS
  - v2rayA
  - Xray
  - 离线安装
---

在纯内网环境里，所有“在线安装的一键爽感”都会失效，剩下的只有可控的底层逻辑：**二进制落点、权限边界、systemd 生命周期、入站口子是否真正开放**。
这篇文章是一份可直接执行的离线部署手册，用于在 **CentOS 9** 上安装 **Xray 核心 + v2rayA 面板**，并完成防火墙与面板关键配置。

> 适用场景：服务器无法访问 GitHub、无法联网拉取依赖、也不希望引入额外仓库。

## ✦ 准备工作：本地代下与上传 (Preparation: Download & Upload)

### ✦ 资源下载 (Artifacts)

请在你的个人电脑上下载并准备以下文件（你已提供下载入口）：

- Xray 核心包（zip）：https://link.arturia.cn/3
- v2rayA 安装包（rpm）：https://link.arturia.cn/2

建议你在本地为文件做一次校验（可选，但强烈推荐），确保上传过程中没有损坏：

```bash
# 在你的个人电脑上执行
sha256sum Xray-linux-64.zip
sha256sum installer_redhat_x64_*.rpm
```

### ✦ 文件上传 (Upload)

将以下文件上传到服务器 `/root/` 目录：

- `/root/Xray-linux-64.zip`
- `/root/installer_redhat_x64_xxx.rpm`

你最终要看到的状态是：`/root/` 下同时存在 zip 与 rpm。

## ✦ 第一阶段：部署 Xray 内核 (Phase 1: Deploy Xray Core)

### ✦ 解压核心文件 (Extract Core)

```bash
mkdir -p /root/xray_temp
python3 -m zipfile -e /root/Xray-linux-64.zip /root/xray_temp
```

### ✦ 移动文件与权限设置 (Install Binaries & Permissions)

```bash
# 移动程序
cp /root/xray_temp/xray/xray /usr/local/bin/
chmod +x /usr/local/bin/xray

# 移动路由规则
mkdir -p /usr/local/share/xray
cp /root/xray_temp/xray/geo*.dat /usr/local/share/xray/
```

### ✦ 验证内核 (Verify Core)

```bash
xray -version
```

如果输出包含版本信息，说明核心落点与执行权限已就绪。

## ✦ 第二阶段：安装 v2rayA 面板 (Phase 2: Install v2rayA)

### ✦ 离线安装 RPM (Offline Install)

```bash
sudo rpm -ivh /root/installer_redhat_x64_*.rpm
```

> 备注：若 rpm 报依赖缺失，说明该 rpm 并非完全静态/自带依赖。此时需要你在“本地代下”阶段一并准备依赖 rpm 并一起上传，然后再用 `rpm -Uvh *.rpm` 批量安装。

### ✦ 启动与开机自启 (Enable & Start)

```bash
sudo systemctl enable --now v2raya.service
```

### ✦ 服务状态确认 (Service Status)

```bash
sudo systemctl status v2raya.service
```

此处目标是看到 `active (running)`。

## ✦ 第三阶段：防火墙入站规则 (Phase 3: Firewall Inbound Rules)

如果你需要从外部设备（例如你的 PC）访问面板或使用代理端口，必须放行**入站端口**。

### ✦ 放行 Web 管理界面 (2017) (Allow Panel Port)

```bash
sudo firewall-cmd --zone=public --add-port=2017/tcp --permanent
```

### ✦ 放行代理使用端口 (20170-20172) (Allow Proxy Ports)

- 20170：混合端口（HTTP/SOCKS5）
- 20171：纯 HTTP
- 20172：纯 SOCKS5

```bash
sudo firewall-cmd --zone=public --add-port=20170/tcp --permanent
sudo firewall-cmd --zone=public --add-port=20171/tcp --permanent
sudo firewall-cmd --zone=public --add-port=20172/tcp --permanent
```

### ✦ 使规则生效 (Reload Firewall)

```bash
sudo firewall-cmd --reload
```

（可选）你也可以列出当前已放行端口，确认规则确实写入：

```bash
sudo firewall-cmd --zone=public --list-ports
```

## ✦ 第四阶段：面板关键设置 (Phase 4: Panel Critical Settings)

### ✦ 访问面板 (Access Panel)

在浏览器中打开：

- `http://服务器IP:2017`

### ✦ 开启局域网共享 (Share on LAN)

进入右上角 **设置（齿轮）**，找到：

- **局域网共享 (Share on LAN)**：勾选并保存

这是一个决定“可用性”的开关：
不开启时，代理端口可能仅监听 `127.0.0.1`，外部设备无法连接，表现会像“端口明明放行了，但就是连不上”。

### ✦ 配置代理模式 (Proxy Mode)

根据你的需求选择：

- 规则端口代理
- 全局代理

这里的选择决定了流量在星轨中的分流方式：你希望“按规则走”，还是“统一走”。

## ✦ 常见问题排查 (Troubleshooting)

### ✦ 无法访问 2017 面板 (Cannot Access Panel)

```bash
systemctl status v2raya
```

确认服务运行后，再检查：

- `firewalld` 是否已放行 2017
- 若是云服务器：云厂商安全组是否也放行 2017（很多人卡在这里）

### ✦ 代理端口连不上 (Proxy Ports Unreachable)

优先确认两件事：

1. 面板里是否开启了 **Share on LAN**
2. 防火墙端口是否放行（20170-20172）

### ✦ 节点无法解析或核心不可用 (Core Not Working)

确认 `xray` 可执行文件位置与权限：

```bash
ls -l /usr/local/bin/xray
xray -version
```

以及规则文件是否存在：

```bash
ls -l /usr/local/share/xray/geo*.dat
```

## ✦ 收束：可验证的完成标准 (Done Criteria)

当你满足以下条件，可以认为部署闭环完成：

- `xray -version` 正常输出
- `systemctl status v2raya` 为 `active (running)`
- 外部浏览器可访问 `http://服务器IP:2017`
- 面板启用 `Share on LAN`
- 代理端口（20170-20172）在你的使用端可建立连接

在纯离线环境里，部署成功不是“跑过一遍命令”，而是“每个边界条件都可验证”。这才是数字领地里真正可复用的工程路径。
