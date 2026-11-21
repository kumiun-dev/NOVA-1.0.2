import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "隐私政策 | NOVA",
  description: "NOVA 外贸 CRM 平台隐私政策及 Facebook Messenger 数据处理说明。",
};

const sections = [
  {
    title: "我们处理哪些信息",
    body: "NOVA 是供企业管理客户关系和沟通记录使用的平台。使用 Facebook Messenger 连接时，经授权的主页管理员可将其有权管理的 Facebook 公共主页连接到 NOVA。为提供收件箱和回复功能，NOVA 会处理主页名称及编号、对话参与者的 Meta 编号、消息内容、消息编号和时间等由 Meta 提供的数据。",
  },
  {
    title: "信息如何使用",
    body: "这些信息用于显示和管理客户会话、接收主页的新消息、让获授权的团队成员查看并回复，以及保障平台安全和排查故障。NOVA 不会使用这些信息替客户运营主页或投放广告。客户主动使用 AI 起草或自动回复时，相关消息内容可能会发送给该客户所配置的 AI 服务商以生成回复；未启用这些功能时，不会因 Facebook 连接而自动发送给 AI 服务商。",
  },
  {
    title: "访问与分享",
    body: "NOVA 仅在提供服务所需的范围内处理信息。托管版按客户账户隔离业务数据，并仅向该客户授权的账户成员开放。连接 Facebook 及收发消息需要通过 Meta 平台处理数据，并受 Meta 平台条款和政策约束。NOVA 不出售 Facebook 平台数据，也不会将其用于跨客户广告画像。法律要求、平台安全或服务运行所必需的情况除外。",
  },
  {
    title: "保存与安全",
    body: "消息和连接资料会在提供服务及客户使用期间保存在 NOVA 账户对应的数据空间中。NOVA 使用账户访问控制和数据隔离措施限制访问。数据可能在备份中保留至备份轮换或删除周期结束。客户自托管版本的数据由客户自己的服务器管理员控制。",
  },
  {
    title: "撤销连接与隐私请求",
    body: "主页管理员可在 NOVA 的“社媒渠道”中断开 Facebook 连接，也可在 Meta/Facebook 的业务集成设置中移除应用授权。断开连接会停止后续授权访问，但不会自动删除此前已保存的消息。请求删除 NOVA 中保存的信息，请按用户数据删除说明页面联系管理相应主页或 NOVA 账户的企业管理员。",
  },
  {
    title: "政策更新",
    body: "服务或法律要求变化时，本政策可能更新。更新版本会发布在本页面，并标注最近更新日期。",
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#f6f7fb] px-5 py-12 text-[#172033] sm:px-8">
      <article className="mx-auto max-w-3xl rounded-2xl border border-[#e5e7ef] bg-white p-7 shadow-sm sm:p-11">
        <a className="text-sm font-semibold text-[#5b4ce2]" href="/">NOVA · 外贸 CRM</a>
        <h1 className="mt-6 text-3xl font-bold">隐私政策</h1>
        <p className="mt-3 text-sm text-[#667085]">最近更新：2026 年 11 月 19 日</p>
        <p className="mt-6 leading-7 text-[#475467]">本政策说明 NOVA 外贸 CRM 平台如何处理通过 Facebook Messenger 连接及其他平台功能获得的信息。NOVA 提供给企业使用；连接主页的企业负责其主页与客户沟通，并应确保其有权处理相关信息。</p>
        <div className="mt-8 space-y-7">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <p className="mt-2 leading-7 text-[#475467]">{section.body}</p>
            </section>
          ))}
        </div>
        <p className="mt-10 border-t border-[#eaecf0] pt-5 text-sm text-[#667085]">用户数据删除方式：<a className="font-medium text-[#5b4ce2] underline" href="/data-deletion">查看删除说明</a></p>
      </article>
    </main>
  );
}
