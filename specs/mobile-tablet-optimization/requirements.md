# Requirements Document - 移动端与平板适配优化

## Introduction

优化系统界面在移动端（手机）和平板设备上的显示效果，重点改进布局、导航和交互体验，确保在小屏幕设备上也能流畅使用核心功能。

## Requirements

### Requirement 1 - 响应式导航栏优化

**User Story:** 作为移动端用户，我希望导航菜单能自动隐藏或变为底部导航，以节省屏幕空间。

#### Acceptance Criteria

1.  **Condition**: 当屏幕宽度小于 768px (Mobile/Tablet) 时。
    **Trigger**: 页面加载或窗口调整大小时。
    **Response**: 侧边栏 (Sidebar) 应自动隐藏，顶部 Header 显示"汉堡菜单"按钮，点击可展开抽屉式导航；或者在手机端切换为底部导航栏 (Tab Bar)。(推荐使用抽屉式侧边栏以保持一致性)
2.  **Condition**: 当点击菜单项或遮罩层时。
    **Trigger**: 用户进行导航操作。
    **Response**: 抽屉式导航应自动关闭。

### Requirement 2 - 仪表盘 (Dashboard) 移动端适配

**User Story:** 作为用户，我希望在手机上能清晰查看仪表盘的关键数据，而不需要左右滑动。

#### Acceptance Criteria

1.  **Condition**: 当屏幕宽度小于 768px 时。
    **Trigger**: 访问仪表盘页面。
    **Response**:
    - 顶部统计卡片 (Stats Card) 应由 4列 (span 6) 变为 2列 (span 12) 或 1列 (span 24)。
    - 欠费预警 (Arrears Summary) 卡片应调整为单列垂直排列。
    - 图表 (Recharts) 容器应自适应宽度，保持高度适中 (如 300px)。

### Requirement 3 - 单位列表与表格适配

**User Story:** 作为用户，我希望在手机上浏览单位列表时，表格内容不溢出，或者以卡片形式展示关键信息。

#### Acceptance Criteria

1.  **Condition**: 当屏幕宽度小于 768px 时。
    **Trigger**: 访问单位列表页或财务流水页。
    **Response**:
    - **方案 A (响应式表格)**: 隐藏非核心列 (如创建时间、备注)，保留核心列 (名称、余额、状态、操作)，并允许横向滚动。
    - **方案 B (卡片视图 - 推荐)**: 隐藏表格，切换为"卡片列表"视图。每个单位显示为一个卡片，展示名称、余额 (带颜色)、状态标签，点击卡片进入详情。

### Requirement 4 - 单位详情页适配

**User Story:** 作为用户，我希望在手机上能方便地录入抄表数据和查看历史记录。

#### Acceptance Criteria

1.  **Condition**: 当屏幕宽度小于 768px 时。
    **Trigger**: 访问单位详情页。
    **Response**:
    - 顶部的 Tabs 导航应支持横向滚动。
    - "基本信息"卡片布局调整为单列。
    - "抄表记录"表格同样采用卡片式或简化列展示。
    - 底部操作按钮 (如保存、充值) 应固定在屏幕底部或保持易点击的大小。

### Requirement 5 - 弹窗与表单适配

**User Story:** 作为用户，我希望在手机上进行弹窗操作 (如添加单位、充值) 时，弹窗大小合适，不被键盘遮挡。

#### Acceptance Criteria

1.  **Condition**: 当屏幕宽度小于 768px 时。
    **Trigger**: 打开 Modal (对话框)。
    **Response**:
    - Modal 宽度应设为 100% 或 95%，且距离顶部距离适中。
    - 对于长表单，Modal 内容区应支持滚动。
