-- Firmalar arası ilişki denetimi: bir firmanın kaydı başka firmanın kaydına bağlanamaz.
-- Uygulama sorguları firma numarasıyla süzülür; ama istekten gelen ilişki numarası (ör. Product.categoryId) doğrulanmadan
-- yazılırsa başka firmanın kaydına bağ kurulabiliyordu. Her firma → firma ilişkisi yazılırken (INSERT ve ilgili sütunun
-- UPDATE'i) ilişkili kaydın aynı firmaya ait olduğu veritabanında denetlenir; ham SQL dahil her yolu kapsar ve işlem içinde
-- yeni oluşturulan kaydı da görür. Kullanıcıya (User) bağlantıda platform kullanıcısına (tenantId boş) izin verilir.
-- Liste schema.prisma'dan üretildi (ilişki sayısı: 90). Yeni firma ilişkisi eklenince buraya da tetikleyici eklenmelidir
-- (test/integration/tenantRefs.test.js eksik tetikleyiciyi yakalar).

CREATE OR REPLACE FUNCTION tenant_ref_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target text := TG_ARGV[0];
  col text := TG_ARGV[1];
  ref_id integer;
  old_id integer;
  ok boolean;
BEGIN
  IF NEW."tenantId" IS NULL THEN RETURN NEW; END IF;
  EXECUTE format('SELECT ($1).%I', col) INTO ref_id USING NEW;
  IF ref_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    EXECUTE format('SELECT ($1).%I', col) INTO old_id USING OLD;
    IF old_id IS NOT DISTINCT FROM ref_id AND OLD."tenantId" IS NOT DISTINCT FROM NEW."tenantId" THEN RETURN NEW; END IF;
  END IF;
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE id = $1 AND ("tenantId" = $2%s))', target,
    CASE WHEN target = 'User' THEN ' OR "tenantId" IS NULL' ELSE '' END)
    INTO ok USING ref_id, NEW."tenantId";
  IF NOT ok THEN
    RAISE EXCEPTION 'tenant_ref: %.% = % bu firmaya ait değil', TG_TABLE_NAME, col, ref_id USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "tenant_ref_User_companyId" BEFORE INSERT OR UPDATE OF "companyId", "tenantId" ON "User" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Company', 'companyId');
CREATE TRIGGER "tenant_ref_Company_ownerId" BEFORE INSERT OR UPDATE OF "ownerId", "tenantId" ON "Company" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('User', 'ownerId');
CREATE TRIGGER "tenant_ref_Company_plasiyerId" BEFORE INSERT OR UPDATE OF "plasiyerId", "tenantId" ON "Company" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('User', 'plasiyerId');
CREATE TRIGGER "tenant_ref_PartnerNote_companyId" BEFORE INSERT OR UPDATE OF "companyId", "tenantId" ON "PartnerNote" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Company', 'companyId');
CREATE TRIGGER "tenant_ref_PartnerNote_userId" BEFORE INSERT OR UPDATE OF "userId", "tenantId" ON "PartnerNote" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('User', 'userId');
CREATE TRIGGER "tenant_ref_PartnerDocument_companyId" BEFORE INSERT OR UPDATE OF "companyId", "tenantId" ON "PartnerDocument" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Company', 'companyId');
CREATE TRIGGER "tenant_ref_StatementRequest_companyId" BEFORE INSERT OR UPDATE OF "companyId", "tenantId" ON "StatementRequest" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Company', 'companyId');
CREATE TRIGGER "tenant_ref_CompanyContact_companyId" BEFORE INSERT OR UPDATE OF "companyId", "tenantId" ON "CompanyContact" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Company', 'companyId');
CREATE TRIGGER "tenant_ref_Category_parentId" BEFORE INSERT OR UPDATE OF "parentId", "tenantId" ON "Category" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Category', 'parentId');
CREATE TRIGGER "tenant_ref_Product_categoryId" BEFORE INSERT OR UPDATE OF "categoryId", "tenantId" ON "Product" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Category', 'categoryId');
CREATE TRIGGER "tenant_ref_Product_parentId" BEFORE INSERT OR UPDATE OF "parentId", "tenantId" ON "Product" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Product', 'parentId');
CREATE TRIGGER "tenant_ref_Product_alternativeToId" BEFORE INSERT OR UPDATE OF "alternativeToId", "tenantId" ON "Product" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Product', 'alternativeToId');
CREATE TRIGGER "tenant_ref_Order_userId" BEFORE INSERT OR UPDATE OF "userId", "tenantId" ON "Order" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('User', 'userId');
CREATE TRIGGER "tenant_ref_Order_companyId" BEFORE INSERT OR UPDATE OF "companyId", "tenantId" ON "Order" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Company', 'companyId');
CREATE TRIGGER "tenant_ref_Order_warehouseId" BEFORE INSERT OR UPDATE OF "warehouseId", "tenantId" ON "Order" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Warehouse', 'warehouseId');
CREATE TRIGGER "tenant_ref_WarehouseStock_warehouseId" BEFORE INSERT OR UPDATE OF "warehouseId", "tenantId" ON "WarehouseStock" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Warehouse', 'warehouseId');
CREATE TRIGGER "tenant_ref_WarehouseStock_productId" BEFORE INSERT OR UPDATE OF "productId", "tenantId" ON "WarehouseStock" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Product', 'productId');
CREATE TRIGGER "tenant_ref_DeliveryAddress_companyId" BEFORE INSERT OR UPDATE OF "companyId", "tenantId" ON "DeliveryAddress" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Company', 'companyId');
CREATE TRIGGER "tenant_ref_Invoice_orderId" BEFORE INSERT OR UPDATE OF "orderId", "tenantId" ON "Invoice" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Order', 'orderId');
CREATE TRIGGER "tenant_ref_OrderItem_orderId" BEFORE INSERT OR UPDATE OF "orderId", "tenantId" ON "OrderItem" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Order', 'orderId');
CREATE TRIGGER "tenant_ref_OrderItem_productId" BEFORE INSERT OR UPDATE OF "productId", "tenantId" ON "OrderItem" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Product', 'productId');
CREATE TRIGGER "tenant_ref_Payment_orderId" BEFORE INSERT OR UPDATE OF "orderId", "tenantId" ON "Payment" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Order', 'orderId');
CREATE TRIGGER "tenant_ref_Payment_companyId" BEFORE INSERT OR UPDATE OF "companyId", "tenantId" ON "Payment" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Company', 'companyId');
CREATE TRIGGER "tenant_ref_FinancialTransaction_companyId" BEFORE INSERT OR UPDATE OF "companyId", "tenantId" ON "FinancialTransaction" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Company', 'companyId');
CREATE TRIGGER "tenant_ref_FinancialTransaction_orderId" BEFORE INSERT OR UPDATE OF "orderId", "tenantId" ON "FinancialTransaction" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Order', 'orderId');
CREATE TRIGGER "tenant_ref_FinancialTransaction_paymentId" BEFORE INSERT OR UPDATE OF "paymentId", "tenantId" ON "FinancialTransaction" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Payment', 'paymentId');
CREATE TRIGGER "tenant_ref_FinancialTransaction_reversalOfId" BEFORE INSERT OR UPDATE OF "reversalOfId", "tenantId" ON "FinancialTransaction" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('FinancialTransaction', 'reversalOfId');
CREATE TRIGGER "tenant_ref_PlasiyerPoint_userId" BEFORE INSERT OR UPDATE OF "userId", "tenantId" ON "PlasiyerPoint" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('User', 'userId');
CREATE TRIGGER "tenant_ref_PlasiyerPoint_orderId" BEFORE INSERT OR UPDATE OF "orderId", "tenantId" ON "PlasiyerPoint" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Order', 'orderId');
CREATE TRIGGER "tenant_ref_Reconciliation_companyId" BEFORE INSERT OR UPDATE OF "companyId", "tenantId" ON "Reconciliation" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Company', 'companyId');
CREATE TRIGGER "tenant_ref_Reconciliation_userId" BEFORE INSERT OR UPDATE OF "userId", "tenantId" ON "Reconciliation" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('User', 'userId');
CREATE TRIGGER "tenant_ref_ReturnRequest_companyId" BEFORE INSERT OR UPDATE OF "companyId", "tenantId" ON "ReturnRequest" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Company', 'companyId');
CREATE TRIGGER "tenant_ref_ReturnRequest_userId" BEFORE INSERT OR UPDATE OF "userId", "tenantId" ON "ReturnRequest" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('User', 'userId');
CREATE TRIGGER "tenant_ref_ReturnRequest_orderId" BEFORE INSERT OR UPDATE OF "orderId", "tenantId" ON "ReturnRequest" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Order', 'orderId');
CREATE TRIGGER "tenant_ref_ReturnRequest_orderItemId" BEFORE INSERT OR UPDATE OF "orderItemId", "tenantId" ON "ReturnRequest" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('OrderItem', 'orderItemId');
CREATE TRIGGER "tenant_ref_ReturnRequest_productId" BEFORE INSERT OR UPDATE OF "productId", "tenantId" ON "ReturnRequest" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Product', 'productId');
CREATE TRIGGER "tenant_ref_PushSubscription_userId" BEFORE INSERT OR UPDATE OF "userId", "tenantId" ON "PushSubscription" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('User', 'userId');
CREATE TRIGGER "tenant_ref_Notification_userId" BEFORE INSERT OR UPDATE OF "userId", "tenantId" ON "Notification" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('User', 'userId');
CREATE TRIGGER "tenant_ref_StockAlert_userId" BEFORE INSERT OR UPDATE OF "userId", "tenantId" ON "StockAlert" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('User', 'userId');
CREATE TRIGGER "tenant_ref_StockAlert_productId" BEFORE INSERT OR UPDATE OF "productId", "tenantId" ON "StockAlert" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Product', 'productId');
CREATE TRIGGER "tenant_ref_ProductOption_productId" BEFORE INSERT OR UPDATE OF "productId", "tenantId" ON "ProductOption" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Product', 'productId');
CREATE TRIGGER "tenant_ref_ProductOptionValue_optionId" BEFORE INSERT OR UPDATE OF "optionId", "tenantId" ON "ProductOptionValue" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('ProductOption', 'optionId');
CREATE TRIGGER "tenant_ref_ProductVariantValue_variantId" BEFORE INSERT OR UPDATE OF "variantId", "tenantId" ON "ProductVariantValue" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Product', 'variantId');
CREATE TRIGGER "tenant_ref_ProductVariantValue_optionValueId" BEFORE INSERT OR UPDATE OF "optionValueId", "tenantId" ON "ProductVariantValue" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('ProductOptionValue', 'optionValueId');
CREATE TRIGGER "tenant_ref_SpecialPrice_productId" BEFORE INSERT OR UPDATE OF "productId", "tenantId" ON "SpecialPrice" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Product', 'productId');
CREATE TRIGGER "tenant_ref_SpecialPrice_companyId" BEFORE INSERT OR UPDATE OF "companyId", "tenantId" ON "SpecialPrice" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Company', 'companyId');
CREATE TRIGGER "tenant_ref_OrderShipment_orderId" BEFORE INSERT OR UPDATE OF "orderId", "tenantId" ON "OrderShipment" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Order', 'orderId');
CREATE TRIGGER "tenant_ref_DealerTarget_companyId" BEFORE INSERT OR UPDATE OF "companyId", "tenantId" ON "DealerTarget" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Company', 'companyId');
CREATE TRIGGER "tenant_ref_Coupon_companyId" BEFORE INSERT OR UPDATE OF "companyId", "tenantId" ON "Coupon" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Company', 'companyId');
CREATE TRIGGER "tenant_ref_ProductCompatibility_productId" BEFORE INSERT OR UPDATE OF "productId", "tenantId" ON "ProductCompatibility" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Product', 'productId');
CREATE TRIGGER "tenant_ref_ProductCompatibility_compatibleId" BEFORE INSERT OR UPDATE OF "compatibleId", "tenantId" ON "ProductCompatibility" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Product', 'compatibleId');
CREATE TRIGGER "tenant_ref_QuoteRequest_companyId" BEFORE INSERT OR UPDATE OF "companyId", "tenantId" ON "QuoteRequest" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Company', 'companyId');
CREATE TRIGGER "tenant_ref_QuoteRequest_userId" BEFORE INSERT OR UPDATE OF "userId", "tenantId" ON "QuoteRequest" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('User', 'userId');
CREATE TRIGGER "tenant_ref_QuoteRequest_preparedById" BEFORE INSERT OR UPDATE OF "preparedById", "tenantId" ON "QuoteRequest" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('User', 'preparedById');
CREATE TRIGGER "tenant_ref_QuoteRequest_orderId" BEFORE INSERT OR UPDATE OF "orderId", "tenantId" ON "QuoteRequest" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Order', 'orderId');
CREATE TRIGGER "tenant_ref_QuoteRequestItem_quoteRequestId" BEFORE INSERT OR UPDATE OF "quoteRequestId", "tenantId" ON "QuoteRequestItem" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('QuoteRequest', 'quoteRequestId');
CREATE TRIGGER "tenant_ref_QuoteRequestItem_productId" BEFORE INSERT OR UPDATE OF "productId", "tenantId" ON "QuoteRequestItem" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Product', 'productId');
CREATE TRIGGER "tenant_ref_QuoteRevision_quoteRequestId" BEFORE INSERT OR UPDATE OF "quoteRequestId", "tenantId" ON "QuoteRevision" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('QuoteRequest', 'quoteRequestId');
CREATE TRIGGER "tenant_ref_Favorite_userId" BEFORE INSERT OR UPDATE OF "userId", "tenantId" ON "Favorite" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('User', 'userId');
CREATE TRIGGER "tenant_ref_Favorite_productId" BEFORE INSERT OR UPDATE OF "productId", "tenantId" ON "Favorite" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Product', 'productId');
CREATE TRIGGER "tenant_ref_OrderTemplate_companyId" BEFORE INSERT OR UPDATE OF "companyId", "tenantId" ON "OrderTemplate" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Company', 'companyId');
CREATE TRIGGER "tenant_ref_OrderTemplate_userId" BEFORE INSERT OR UPDATE OF "userId", "tenantId" ON "OrderTemplate" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('User', 'userId');
CREATE TRIGGER "tenant_ref_WebhookDelivery_webhookId" BEFORE INSERT OR UPDATE OF "webhookId", "tenantId" ON "WebhookDelivery" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Webhook', 'webhookId');
CREATE TRIGGER "tenant_ref_SupportTicket_userId" BEFORE INSERT OR UPDATE OF "userId", "tenantId" ON "SupportTicket" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('User', 'userId');
CREATE TRIGGER "tenant_ref_SupportMessage_ticketId" BEFORE INSERT OR UPDATE OF "ticketId", "tenantId" ON "SupportMessage" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('SupportTicket', 'ticketId');
CREATE TRIGGER "tenant_ref_WaMessage_conversationId" BEFORE INSERT OR UPDATE OF "conversationId", "tenantId" ON "WaMessage" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('WaConversation', 'conversationId');
CREATE TRIGGER "tenant_ref_CashEntry_recurringId" BEFORE INSERT OR UPDATE OF "recurringId", "tenantId" ON "CashEntry" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('CashRecurring', 'recurringId');
CREATE TRIGGER "tenant_ref_Employee_userId" BEFORE INSERT OR UPDATE OF "userId", "tenantId" ON "Employee" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('User', 'userId');
CREATE TRIGGER "tenant_ref_Employee_managerId" BEFORE INSERT OR UPDATE OF "managerId", "tenantId" ON "Employee" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Employee', 'managerId');
CREATE TRIGGER "tenant_ref_LeaveRequest_employeeId" BEFORE INSERT OR UPDATE OF "employeeId", "tenantId" ON "LeaveRequest" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Employee', 'employeeId');
CREATE TRIGGER "tenant_ref_StaffClaim_employeeId" BEFORE INSERT OR UPDATE OF "employeeId", "tenantId" ON "StaffClaim" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Employee', 'employeeId');
CREATE TRIGGER "tenant_ref_StaffTarget_employeeId" BEFORE INSERT OR UPDATE OF "employeeId", "tenantId" ON "StaffTarget" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Employee', 'employeeId');
CREATE TRIGGER "tenant_ref_StaffPayment_employeeId" BEFORE INSERT OR UPDATE OF "employeeId", "tenantId" ON "StaffPayment" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Employee', 'employeeId');
CREATE TRIGGER "tenant_ref_StaffPayment_claimId" BEFORE INSERT OR UPDATE OF "claimId", "tenantId" ON "StaffPayment" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('StaffClaim', 'claimId');
CREATE TRIGGER "tenant_ref_StaffPayment_targetId" BEFORE INSERT OR UPDATE OF "targetId", "tenantId" ON "StaffPayment" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('StaffTarget', 'targetId');
CREATE TRIGGER "tenant_ref_StaffPayment_advanceId" BEFORE INSERT OR UPDATE OF "advanceId", "tenantId" ON "StaffPayment" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('StaffClaim', 'advanceId');
CREATE TRIGGER "tenant_ref_SmsCampaign_createdById" BEFORE INSERT OR UPDATE OF "createdById", "tenantId" ON "SmsCampaign" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('User', 'createdById');
CREATE TRIGGER "tenant_ref_SmsCampaignRecipient_campaignId" BEFORE INSERT OR UPDATE OF "campaignId", "tenantId" ON "SmsCampaignRecipient" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('SmsCampaign', 'campaignId');
CREATE TRIGGER "tenant_ref_MailCampaign_createdById" BEFORE INSERT OR UPDATE OF "createdById", "tenantId" ON "MailCampaign" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('User', 'createdById');
CREATE TRIGGER "tenant_ref_MailCampaignRecipient_campaignId" BEFORE INSERT OR UPDATE OF "campaignId", "tenantId" ON "MailCampaignRecipient" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('MailCampaign', 'campaignId');
CREATE TRIGGER "tenant_ref_OrderRequest_companyId" BEFORE INSERT OR UPDATE OF "companyId", "tenantId" ON "OrderRequest" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Company', 'companyId');
CREATE TRIGGER "tenant_ref_OrderRequest_userId" BEFORE INSERT OR UPDATE OF "userId", "tenantId" ON "OrderRequest" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('User', 'userId');
CREATE TRIGGER "tenant_ref_OrderRequest_decidedById" BEFORE INSERT OR UPDATE OF "decidedById", "tenantId" ON "OrderRequest" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('User', 'decidedById');
CREATE TRIGGER "tenant_ref_OrderRequest_orderId" BEFORE INSERT OR UPDATE OF "orderId", "tenantId" ON "OrderRequest" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Order', 'orderId');
CREATE TRIGGER "tenant_ref_Cheque_paymentId" BEFORE INSERT OR UPDATE OF "paymentId", "tenantId" ON "Cheque" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Payment', 'paymentId');
CREATE TRIGGER "tenant_ref_Cheque_companyId" BEFORE INSERT OR UPDATE OF "companyId", "tenantId" ON "Cheque" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Company', 'companyId');
CREATE TRIGGER "tenant_ref_Cheque_endorsedToId" BEFORE INSERT OR UPDATE OF "endorsedToId", "tenantId" ON "Cheque" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Company', 'endorsedToId');
CREATE TRIGGER "tenant_ref_Cheque_endorsePaymentId" BEFORE INSERT OR UPDATE OF "endorsePaymentId", "tenantId" ON "Cheque" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Payment', 'endorsePaymentId');
CREATE TRIGGER "tenant_ref_Visit_userId" BEFORE INSERT OR UPDATE OF "userId", "tenantId" ON "Visit" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('User', 'userId');
CREATE TRIGGER "tenant_ref_Visit_companyId" BEFORE INSERT OR UPDATE OF "companyId", "tenantId" ON "Visit" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Company', 'companyId');
