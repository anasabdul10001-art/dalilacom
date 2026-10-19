process.env.NODE_ENV = "test";
process.env.SHOP_REVIEW = "off"; // shops wait for the admin in the tests; shopReview.test.ts turns the automatic review on
process.env.PRODUCT_REVIEW = "off"; // products show at once in the tests; productReview.test.ts turns the review on
process.env.STORE_PLAN = "off"; // products can be added without choosing a store plan in the tests; storePlan.test.ts turns the rule on
