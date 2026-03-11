import {
  emptyStateTitleClass,
  errorNoticeClass,
  eyebrowClass,
  noticeTextClass,
  noticeTitleClass,
  panelClass,
  primaryButtonClass,
  sectionBodyClass,
} from '../../../lib/ui'

type AuthenticationPanelProps = {
  errorMessage: string | null
  isLoginDisabled: boolean
  isLoginPending: boolean
  onLogin: () => void
}

export function AuthenticationPanel({
  errorMessage,
  isLoginDisabled,
  isLoginPending,
  onLogin,
}: AuthenticationPanelProps) {
  return (
    <section className={`${panelClass} w-full max-w-[680px]`}>
      <p className={eyebrowClass}>Protected Workspace</p>
      <h2 className={emptyStateTitleClass}>使用 Google 登录后访问组合工具</h2>
      <p className={`mt-3.5 ${sectionBodyClass}`}>
        点击下面的按钮后完成 Google 授权。登录成功后会自动返回当前页面；只有白名单里的 Google 账号可以进入。当前浏览器里的本地缓存也会继续按现有方式使用。
      </p>

      <div className="mt-[18px] grid gap-2.5">
        <span className={noticeTextClass}>1. 点击“使用 Google 登录”</span>
        <span className={noticeTextClass}>2. 选择要使用的 Google 账号</span>
        <span className={noticeTextClass}>3. 授权完成后自动进入组合工作区</span>
      </div>

      <div className="mt-[22px]">
        <button
          className={primaryButtonClass}
          disabled={isLoginDisabled}
          onClick={onLogin}
          type="button"
        >
          {isLoginPending ? '处理中...' : '使用 Google 登录'}
        </button>
      </div>

      {errorMessage ? (
        <div className={errorNoticeClass}>
          <p className={noticeTitleClass}>登录状态</p>
          <span className={noticeTextClass}>{errorMessage}</span>
        </div>
      ) : null}
    </section>
  )
}
