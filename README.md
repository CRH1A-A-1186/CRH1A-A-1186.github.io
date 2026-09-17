# CRH1A-A-1186.github.io

个人网站，内容以铁路为主：BVE 资源、线路图、铁道走行音，外加两个子项目（PIDS 显示器模拟器、网页小游戏）。

**线上地址：<https://crh1a-a-1186.github.io/>**

## 站点内容

| 页面 | 路径 | 内容 |
|------|------|------|
| 首页 | `index.html` | 个人简介、更新日志、PIDS 模拟器入口 |
| BVE | `BVE.html` | BVE Trainsim 资源：JR 北海道札沼线、TIMS_tool 工具 |
| DCS World | `dcs.html` | DCS World 相关内容（施工中） |
| 线路图 | `routemap.html` | 相铁 / JR / 东急直通系统实际走向图，可下载 PNG |
| 走行音 | `running.html` | 北京地铁 1 / 4 / 7 / 10 / 14 / 19 号线、昌平线共 8 段走行音 |
| PIDS 模拟器 | `PIDS_simulator/index.html` | 地铁乘客信息显示屏模拟器（git 子模块，见下） |
| 小游戏 | `EatCR200J-main/index.html` | 网页小游戏「吃掉 CR200J」 |

导航菜单在 5 个主站页面里各有一份副本，改动时需同步更新。

## 目录结构

```
CRH1A-A-1186.github.io/
├── index.html              # 首页
├── BVE.html                # BVE 资源页
├── dcs.html                # DCS World 页
├── routemap.html           # 线路图页
├── running.html            # 走行音页
├── default.css             # 全站样式（唯一 CSS 文件）
├── fonts.css               # FontAwesome 字体定义
├── images/                 # Banner 与头像（约 0.6 MB）
├── fonts/                  # FontAwesome 字体文件
├── running/                # 走行音 MP3（8 个，约 59 MB，仓库体积大头）
├── routemap/               # 线路图资源（SO_TY/ 相铁·东急直通图）
├── PIDS_simulator/         # PIDS 模拟器 —— git 子模块，不在本库内
├── EatCR200J-main/         # 网页小游戏（改编自 EatKano）
├── .gitmodules             # 子模块声明
├── CLAUDE.md               # 项目规范：编辑纪律、CSS 规范、验收方式
└── README.md
```

## PIDS_simulator 子模块

`PIDS_simulator/` 不是本站的文件，而是独立仓库 [CRH1A-A-1186/PIDS_simulator](https://github.com/CRH1A-A-1186/PIDS_simulator) 的 git 子模块，主库只保存一个提交指针。

克隆时要带上子模块：

```bash
git clone --recurse-submodules https://github.com/CRH1A-A-1186/CRH1A-A-1186.github.io.git
# 已经克隆过、目录为空的，补一次：
git submodule update --init
```

修改 PIDS 的流程（不要在克隆出来的 `PIDS_simulator/` 里改完就直接在主库提交）：

```bash
# 1) 在 PIDS 仓库改并推送
cd PIDS_simulator
git add -A && git commit -m "..." && git push origin master

# 2) 回主库把指针挪到新提交
cd ..
git submodule update --remote PIDS_simulator
git add PIDS_simulator
git commit -m "更新 PIDS 子模块指针"
git push
```

漏掉第 2 步，线上仍然发布旧版本的 PIDS。

## 技术约束

| 约束 | 说明 |
|------|------|
| 零依赖 | 不引入 npm 包、CDN 链接、第三方 JS/CSS 库 |
| 纯静态 | 无需构建工具，浏览器直接打开 `.html` 文件 |
| 原生 CSS3 | CSS 变量 + Flexbox + Grid，无预处理器 |
| 无 JS 框架 | 主站为纯 HTML + CSS；两个子项目自带原生 JS |
| 中文优先 | 页面内容为中文，代码注释可中英混合 |

## 本地预览

主站直接双击 `index.html` 即可，CSS、字体、图片均为相对路径，不需要服务器也不需要构建。两个子项目同理，打开各自的 `index.html`。

想更接近线上环境（路径与缓存行为一致）时，可在项目根目录起一个静态服务器：

```bash
python -m http.server 8000   # 然后访问 http://localhost:8000/
```

## 部署

- 站点类型：GitHub Pages **用户主页**（User Site），因此仓库名必须与用户名完全一致，即 `CRH1A-A-1186.github.io`。
- 发布源：`main` 分支的 `/ (root)` 目录；推送到 `main` 即触发构建，通常一分钟内生效。
- 子模块：构建时 GitHub Pages 会自动拉取子模块内容，前提是子模块为**公开仓库**，且 `.gitmodules` 里使用 **`https://` 只读地址**。
- 旧地址 `1aa1186.github.io`、`njfdCRH1A.github.io` 已随用户名更换失效，请统一使用 <https://crh1a-a-1186.github.io/>。

## 最近更新

- 2026-09-18：用户名更换为 CRH1A-A-1186，站点迁移至新地址；PIDS 模拟器恢复为 git 子模块。

更早的记录见首页的「更新日志」区块。

## 说明

- 站点内容版权归作者所有。
- `PIDS_simulator/` 遵循其自身仓库的 [LICENSE](https://github.com/CRH1A-A-1186/PIDS_simulator/blob/master/LICENSE)。
- `EatCR200J-main/` 改编自 [arcxingye/EatKano](https://github.com/arcxingye/EatKano)，请保留原作的署名与跳转链接；CR200J 车头图像来自 <http://trainfrontview.net/>。
- 编辑与验收规范见 `CLAUDE.md`。
- 找我：Bilibili（推特基本不用……）。
