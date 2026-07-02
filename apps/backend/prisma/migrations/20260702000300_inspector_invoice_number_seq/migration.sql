-- Inspector Property Invoice numbering (spec 032): a dedicated sequence consumed via nextval
-- inside the approval transaction (assigned at approval, not at row creation). Gap-tolerant and
-- unique-guaranteed. Prisma does not model standalone sequences, so it is managed here.
CREATE SEQUENCE "inspector_invoice_number_seq";
