-- Inspector Property Invoice (spec 032): rejected invoices are retained as VOID, never hard-deleted.
-- ALTER TYPE ... ADD VALUE must be isolated in its own migration (the new value cannot be used
-- in the same transaction it is added).
ALTER TYPE "InspectorInvoiceStatus" ADD VALUE 'VOID';
