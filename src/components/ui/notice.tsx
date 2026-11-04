import type { ReactElement, ReactNode } from "react";

type NoticeTone = "info" | "warn" | "stop";

interface NoticeProps {
  readonly tone: NoticeTone;
  readonly title?: string;
  readonly children: ReactNode;
  readonly action?: ReactNode;
}

/**
An announced message. `stop` is the only alert; `info` and `warn` are polite
status. Mount it with its content: filling an already-mounted empty region is
not announced reliably. `aria-atomic` reads a composed message once.
*/
const Notice = ({
  tone,
  title,
  children,
  action,
}: NoticeProps): ReactElement => {
  return (
    <div
      className="notice"
      data-tone={tone}
      role={tone === "stop" ? "alert" : "status"}
      aria-atomic="true"
    >
      {title ? <p className="notice__title">{title}</p> : null}
      <div className="notice__body">{children}</div>
      {action ? <div className="notice__action">{action}</div> : null}
    </div>
  );
};

export { Notice };
export type { NoticeProps, NoticeTone };
