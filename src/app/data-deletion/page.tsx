import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "用户数据删除说明 | NOVA",
  description: "如何请求删除通过 Facebook Messenger 连接至 NOVA 的用户数据。",
};

export default function DataDeletionPage() {
  return (
    <main className="min-h-screen bg-[#f6f7fb] px-5 py-12 text-[#172033] sm:px-8">
      <article className="mx-auto max-w-3xl rounded-2xl border border-[#e5e7ef] bg-white p-7 shadow-sm sm:p-11">
        <a className="text-sm font-semibold text-[#5b4ce2]" href="/">NOVA · 外贸 CRM</a>
        <h1 className="mt-6 text-3xl font-bold">用户数据删除说明</h1>
        <p className="mt-3 text-sm text-[#667085]">最近更新：2026 年 11 月 19 日</p>
        <p className="mt-6 leading-7 text-[#475467]">NOVA 为连接 Facebook 主页的企业提供消息管理服务。消息数据由管理该主页的企业通过 NOVA 处理。你可以按以下步骤请求删除相关数据：</p>
        <ol className="mt-6 list-decimal space-y-4 pl-6 leading-7 text-[#475467]">
          <li>向你曾联系的 Facebook 公共主页发送 Messenger 消息，说明要删除通过该主页产生并由 NOVA 管理的对话数据。也可以联系该企业公布的客服或隐私联系人。</li>
          <li>请提供足以识别对话的信息，例如你联系的主页名称、消息的大致日期，以及你的 Facebook 个人资料链接或 Meta 编号。不要发送密码或登录验证码。</li>
          <li>主页所属企业核实请求后，应由其 NOVA 账户管理员处理删除请求。若你联系的是 NOVA 账户持有人本人，也可直接要求该管理员删除相关客户/会话数据。</li>
        </ol>
        <section className="mt-8 rounded-xl bg-[#f6f7fb] p-5">
          <h2 className="font-semibold">如果你授权了 Facebook 主页连接</h2>
          <p className="mt-2 leading-7 text-[#475467]">主页管理员可在 NOVA“社媒渠道”断开 Facebook 连接，并在 Meta/Facebook 的业务集成设置中移除 NOVA 应用授权。撤销授权会停止后续访问；若要删除此前已同步的消息，还需单独向主页所属企业提出删除请求。</p>
        </section>
        <p className="mt-8 leading-7 text-[#475467]">NOVA 托管版账户管理员可向 NOVA 平台管理员申请删除其账户及关联数据。客户自托管版请联系负责该服务器的管理员。删除后，备份副本可能保留至正常备份轮换周期结束。</p>
        <p className="mt-10 border-t border-[#eaecf0] pt-5 text-sm text-[#667085]">另请参阅：<a className="font-medium text-[#5b4ce2] underline" href="/privacy">NOVA 隐私政策</a></p>
      </article>
    </main>
  );
}
