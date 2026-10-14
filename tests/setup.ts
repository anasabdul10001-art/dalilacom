process.env.NODE_ENV = "test";
process.env.PRODUCT_REVIEW = "off"; // products show at once in the tests; productReview.test.ts turns the review on
process.env.STORE_PLAN = "off"; // products can be added without choosing a store plan in the tests; storePlan.test.ts turns the rule on
