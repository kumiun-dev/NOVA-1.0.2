export function canUseZernioRelay() { return false; }
export async function callZernioRelay<T>(_data: Record<string, string | number | boolean | undefined>, _image?: File): Promise<T> { throw new Error("请配置本公司社媒服务"); }
