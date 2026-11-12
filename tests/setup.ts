process.env.NODE_ENV = "test";
process.env.SHOP_REVIEW = "off"; // shops wait for the admin in the tests; shopReview.test.ts turns the automatic review on
process.env.PRODUCT_REVIEW = "off"; // products show at once in the tests; productReview.test.ts turns the review on
process.env.STORE_PLAN = "off"; // products can be added without choosing a store plan in the tests; storePlan.test.ts turns the rule on
process.env.META_PUBLIC_ACCESS = "true"; // Facebook/Instagram linking is open to everyone in the tests; metaAccess.test.ts closes it
// the HR link tests make more link codes and server calls from one address than a real company ever would
process.env.HR_CONNECT_RATE_LIMIT ??= "500";
process.env.HR_LINK_CODE_RATE_LIMIT ??= "500";
process.env.HR_SYNC_RATE_LIMIT ??= "500";
