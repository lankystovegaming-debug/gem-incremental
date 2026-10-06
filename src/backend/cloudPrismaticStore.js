import { supabase } from './supabase.js';

const rpc = async (name, args) => {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
};

export const loadPrismaticStore = () => rpc('get_prismatic_store');
export const openPrismaticGeode = requestId => rpc('open_prismatic_geode', { p_request_id: requestId });
export const purchasePrismaticExchangeItem = ({ kind, id, requestId }) => rpc('purchase_prismatic_exchange_item', {
  p_kind: kind,
  p_item_id: id,
  p_request_id: requestId
});
export const redeemCosmeticVoucher = ({ voucherType, kind, id, requestId }) => rpc('redeem_cosmetic_voucher', {
  p_voucher_type: voucherType,
  p_kind: kind,
  p_product_id: id,
  p_request_id: requestId
});
