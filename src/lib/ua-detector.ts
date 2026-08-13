/**
 * User-Agent 机器人检测统一入口（可插拔检测器）
 *
 * 通过环境变量 `USER_AGENT_DETECTOR` 在三种检测方案之间动态切换：
 *
 * | 取值   | 检测实现                       | 说明                                                         |
 * |--------|--------------------------------|--------------------------------------------------------------|
 * | `aua`  | @arraypress/user-agent（默认） | 零依赖、兼容 Node/CF Workers/Deno，内置 AI 爬虫（GPTBot 等）识别 |
 * | `isbot`| isbot                          | 经典爬虫名单正则匹配，社区维护更久                            |
 * | `no`   | 关闭 UA 机器人检测              | 仅保留 UA_BLACKLIST / ACCEPT_DOMAINS 层防护                 |
 *
 * 约定：
 * - 未设置环境变量 → 默认 `aua`
 * - 非法取值 → 打印告警并降级为 `aua`（不影响服务启动）
 * - 两种检测方案对外暴露完全一致的接口 `isBot(ua: string): boolean`，
 *   因此切换检测器**不需要改动任何调用方代码**（blocker 等只 import 本模块）。
 *
 * 生效范围：环境变量在模块初始化时读取一次（配置初始化阶段），
 * 即部署时配置的环境变量立即生效，运行时修改需重启函数。
 */
import { isbot as isbotDetect } from 'isbot'
import { isBot as auaIsBot } from '@arraypress/user-agent'

/** 支持的检测器模式 */
export type UserAgentDetectorMode = 'isbot' | 'aua' | 'no'

/** 默认检测器：aua（零依赖、AI 爬虫识别、跨运行时兼容） */
const DEFAULT_MODE: UserAgentDetectorMode = 'aua'

/** 根据环境变量解析检测器模式，非法取值告警并降级为默认值 */
function resolveMode(env: string | undefined): UserAgentDetectorMode {
  if (env === 'isbot' || env === 'aua' || env === 'no') {
    return env
  }
  if (env !== undefined && env !== '') {
    console.warn(
      `[ua-detector] 未识别的 USER_AGENT_DETECTOR 取值 "${env}"（合法值: isbot|aua|no），已降级为默认 "${DEFAULT_MODE}"`
    )
  }
  return DEFAULT_MODE
}

/** 当前生效的检测器模式（模块加载时由环境变量决定） */
export const UA_DETECTOR_MODE: UserAgentDetectorMode = resolveMode(process.env.USER_AGENT_DETECTOR)

/**
 * 判断 User-Agent 是否为机器人（爬虫/无头浏览器/AI 爬虫等）。
 * 两种检测方案（isbot / aua）返回值语义一致：true = 是机器人。
 * `no` 模式下恒返回 false（关闭该层检测）。
 */
export function isBot(ua: string): boolean {
  switch (UA_DETECTOR_MODE) {
    case 'isbot':
      return isbotDetect(ua)
    case 'aua':
      return auaIsBot(ua)
    case 'no':
      return false
  }
}
