# 从源码部署到 Android

此项目不需要部署服务器。手机安装APK后直连公开行情、RSS和自己选择的模型服务。当前使用Python构建脚本，不是Gradle项目；无需把它作为Gradle工程同步。

## 1. 准备环境

参考环境为macOS，安装Git、Python 3、JDK 17或以上，以及Android Studio中的Android SDK。通过SDK Manager安装Android SDK Platform 35、Android SDK Build-Tools 35.0.0、Android SDK Platform-Tools。JDK可使用Android Studio附带的JBR。普通构建不需要Node、npm或模型Key。

```sh
git clone https://github.com/zhangzhou116/gold-radar-android.git
cd gold-radar-android
git config core.hooksPath .githooks
export ANDROID_HOME="$HOME/Library/Android/sdk"
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
python3 tools/build.py
```

按实际安装位置修改环境变量，JAVA_HOME中应能找到bin/javac和bin/keytool。脚本默认JDK位置属于作者本机，其他机器应明确设置JAVA_HOME。

首次构建自动生成属于你自己的APK签名：私钥放在仓库外，密码放在macOS登录钥匙串。系统如提示钥匙串访问，请核对为本机构建操作。钥匙串锁定时先解锁再运行。以后更新保留同一签名，详见[签名说明](../SECURITY.md)。Linux构建需安装兼容SDK及JDK、设置ANDROID_HOME和JAVA_HOME，并由自己的秘密管理器设置GOLD_APK_SIGNING_PASSWORD；Linux、Windows未做端到端构建验证。

## 2. 找到安装包

构建成功输出 `dist/GoldRadar-1.3.1.apk` 和 `dist/SHA256SUMS`。这是不含个人Key的普通版。不要用 `--personal-debug` 构建用于分发的APK，不要分享文件名带PERSONAL-DO-NOT-SHARE的包。

## 3. 安装到手机

支持Android 8.0以上。把普通APK传到手机，从文件管理器打开，按系统提示允许该文件管理器安装应用。或打开开发者选项、USB调试，连接电脑并在手机确认电脑授权：

```sh
"$ANDROID_HOME/platform-tools/adb" devices
"$ANDROID_HOME/platform-tools/adb" install -r dist/GoldRadar-1.3.1.apk
```

出现Success表示安装完成。出现INSTALL_FAILED_UPDATE_INCOMPATIBLE通常是原应用使用另一签名。自行构建不能覆盖作者签名的已安装版本，需使用原签名更新，或先自行处理原应用数据后卸载再安装；卸载会删除密钥、缓存和研判记录。

## 4. 配置与使用

打开应用，等行情刷新，在“局势→配置模型”选择供应商并填自己的Key。详细步骤见[使用教程](USAGE.md)。普通安装不包含作者的Key，应用也不提供免费模型额度。

## 5. 可选代码验证

安装Node.js后可运行本机逻辑检查，不产生模型费用：

```sh
node tools/test-engine.cjs
node tools/test-research.cjs
node tools/test-action-plan.cjs
node tools/test-money.cjs
python3 tools/test-secret-guard.py
python3 tools/check-secrets.py --history
python3 tools/test-proxy.py
```

原生协议测试需要JDK和网络下载一个测试专用org.json JAR，不打入APK。浏览器UI脚本属于开发验证工具，还需Chrome、Playwright及本地真实取数fixture，不是普通安装必需步骤。

## 排错

- Missing build dependency：检查SDK组件版本及两个环境变量。
- Java Runtime不可用：设置JAVA_HOME，不需要改源码中的机器路径。
- 签名密码不可读：解锁登录钥匙串，不要删除原私钥或生成新钥匙替换已发布签名。
- 数据无法刷新：到“来源”页查看具体失败源；公开源受网络和地区限制。
- 不需要Docker、Python常驻后端、服务器IP或电脑持续在线。
