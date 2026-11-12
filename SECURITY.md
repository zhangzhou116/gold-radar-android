# 凭据与签名材料

仓库只维护源码、文档和检查工具，不维护模型密钥、签名私钥、签名密码、手机配置备份或个人截图。仓库保持私有；私有仓库也不作为密码保管库。

## APK 签名

macOS 默认将签名私钥保存在仓库外的：

```text
$HOME/Library/Application Support/GoldRadar/private/signing/goldradar.jks
```

该目录仅当前用户可访问（700），密钥文件权限为600。签名密码存入 macOS 登录钥匙串，项目名为 `cn.local.goldradar.apk-signing`，账户为 `gold-radar-android`。仓库内不写明文密码，构建时按需读取。钥匙串锁定时需正常解锁后再构建。

构建命令仍为 `python3 tools/build.py`。读取旧签名失败时不会替换已有密钥；新源码购买者首次构建会生成自己的签名，不能使用卖方签名冒充更新。原签名需要保留，才能覆盖更新已发布应用。

旧项目迁移命令：

```sh
python3 tools/signing.py migrate /path/to/old-project/.signing
```

迁移会先核对各副本、验证钥匙串密码与密钥，再清理旧项目里的签名和明文密码。不同副本冲突会停止，不覆盖。其他系统通过秘密管理器提供 `GOLD_APK_SIGNING_PASSWORD`；不要把它写进源码或Git。可使用 `GOLD_RADAR_SIGNING_DIR` 指定仓库外的目录。

本地存储不等于备份。应使用加密的系统备份，同时保留私钥及钥匙串恢复能力；不要将私钥、钥匙串导出文件或密码放进源码交付包或 GitHub。

## 模型密钥

普通交付APK不自带卖方的模型密钥。买家安装后，在“局势 → 配置模型”填写自己的密钥，模型费用由买家自己的服务账户承担。密钥通过 Android Keystore 支持的 AES-GCM 加密后保存在该手机的应用私有空间中，配置页禁止截图，Android 备份已禁用。

进行研判时，买家的密钥会随请求发送给其所选模型服务用于鉴权，不能把“本机加密保存”理解为供应商看不到请求。项目不将其传到 GitHub 或卖方自建后台。

分发 APK 文件不包含卖方手机的应用数据；不要交付手机数据备份。当前内置的供应商域名是服务地址，不是访问凭据。公开源码或出售源码前仍应检查具体配置。

## 提交与推送检查

当前工作目录已启用本地 Git hooks。新克隆目录需运行：

```sh
git config core.hooksPath .githooks
python3 tools/check-secrets.py
python3 tools/check-secrets.py --history
```

提交前扫描暂存内容，推送前另扫描本地Git历史；发现常见Token、私钥格式或私有文件路径时拒绝继续，只显示文件位置，不输出敏感值。`.gitignore` 同时排除签名、构建输出、环境配置等。

这些是有限模式检查，不能保证识别所有形式的秘密，也不能撤回已经泄露的凭据。若以后发现凭据进过Git历史，应先在供应商处撤销／轮换，再处理历史。当前已检查的历史未发现上述凭据。

## 本地个人调试包

按所有者要求支持显式预置个人模型Key：在被Git忽略的 `private/personal-debug.json` 中保存 `{"token":"你的密钥"}`，运行 `python3 tools/build.py --personal-debug`。输出名含 `PERSONAL-DO-NOT-SHARE`，仅供本人使用。嵌入APK的密钥可以被解包提取，不可分发该文件。原生首次启动将它导入手机加密存储，不覆盖已配置的Key；WebView禁止读取该私有资源。删除手机Key后不会自动反复恢复。

普通 `python3 tools/build.py` 不读取本地个人配置，构建目录每次清空，避免前次个人配置混入交付包。个人配置及两个版本APK都不入Git。
