import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "服务条款 | NOVA",
  description: "NOVA 外贸 CRM 平台服务条款。",
};

const sections = [
  {
    title: "1. 接受条款与账户",
    body: "使用 NOVA 即表示你代表自己或所在组织接受本条款。你须提供准确的账户资料，妥善保管登录凭据，并对账户下的操作负责。组织账户管理员负责管理员工权限及其团队成员对服务的使用。",
  },
  {
    title: "2. 服务内容",
    body: "NOVA 提供客户关系管理、消息工作台、社媒渠道连接、邮件、报价及相关业务辅助功能。功能可用性取决于账户授权、部署方式、第三方平台接口和服务配置。NOVA 不保证 Facebook、Instagram、Google 或其他第三方平台持续提供接口或保持兼容。",
  },
  {
    title: "3. 第三方账户与授权",
    body: "连接 Facebook、Instagram、Google 或其他第三方服务时，你授权 NOVA 在你选择的权限范围内访问相关账户或主页，以提供你主动启用的功能。你须有权代表该账户或主页进行授权，并遵守对应平台的条款、政策及消息发送规则。你可通过 NOVA 或第三方平台设置撤销授权；撤销后，依赖该授权的功能可能停止。",
  },
  {
    title: "4. 用户内容与数据",
    body: "你及你的组织保留对提交至 NOVA 的客户资料、消息和其他内容的权利，并负责确保收集、使用及处理这些内容具有合法依据。你应及时向相关人员提供必要告知，并避免提交无权处理或违反法律、第三方权利及平台规则的内容。NOVA 按《隐私政策》及你的服务配置处理相关数据。",
  },
  {
    title: "5. 可接受使用",
    body: "不得利用 NOVA 从事违法活动、骚扰或欺诈，发送垃圾信息，绕过第三方平台限制，侵犯他人权利，攻击或干扰服务，或尝试未经授权访问账户、数据及系统。NOVA 可在法律允许范围内限制或暂停涉嫌违反本条款、危及服务安全或损害他人权益的使用。",
  },
  {
    title: "6. AI 与业务建议",
    body: "AI 起草、翻译、自动回复及其他生成内容仅用于辅助。启用相关功能前，你应检查内容及接收对象，并对发送、报价、客户沟通和其他业务决定负责。AI 输出可能不准确或不完整，不构成法律、财务、贸易合规或其他专业意见。",
  },
  {
    title: "7. 服务变更与可用性",
    body: "NOVA 可能调整、维护或停止部分功能，并会在合理可行时尽量降低对服务的影响。服务也可能因网络、维护、第三方平台故障或其他超出合理控制的原因暂时不可用。客户自托管部署由相应服务器管理员负责基础设施、访问安全、备份及恢复。",
  },
  {
    title: "8. 责任与终止",
    body: "在适用法律允许的范围内，NOVA 按服务现状提供平台，不对第三方服务、用户内容或未经核实的 AI 输出作保证。你可停止使用服务，并按《用户数据删除说明》提出数据删除请求。违反本条款或服务授权到期时，NOVA 可依法依约限制或终止相应账户访问。",
  },
  {
    title: "9. 条款更新与联系",
    body: "服务或法律要求变化时，本条款可能更新；更新版本会发布在本页面并标注更新日期。有关 NOVA 账户的问题，请联系为你开通服务的组织管理员或 NOVA 服务提供方。",
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#f6f7fb] px-5 py-12 text-[#172033] sm:px-8">
      <article className="mx-auto max-w-3xl rounded-2xl border border-[#e5e7ef] bg-white p-7 shadow-sm sm:p-11">
        <a className="text-sm font-semibold text-[#5b4ce2]" href="/">NOVA · 外贸 CRM</a>
        <h1 className="mt-6 text-3xl font-bold">服务条款</h1>
        <p className="mt-3 text-sm text-[#667085]">最近更新：2026 年 11 月 19 日</p>
        <p className="mt-6 leading-7 text-[#475467]">本服务条款适用于 NOVA 外贸 CRM 平台及相关功能。使用服务前请阅读本条款和 <a className="font-medium text-[#5b4ce2] underline" href="/privacy">隐私政策</a>。</p>
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
