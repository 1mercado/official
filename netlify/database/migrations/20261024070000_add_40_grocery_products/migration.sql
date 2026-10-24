-- Add starter groceries without changing existing products or admin-set prices.
INSERT INTO "grocery_products" ("name", "description", "category", "unit", "price_centavos", "available")
SELECT seed.*
FROM (VALUES
  ('Jasmine Rice', 'Fragrant white rice for everyday meals.', 'Rice & Pantry', '5 kg bag', 32500, true),
  ('Brown Rice', 'Whole-grain rice with a nutty flavor.', 'Rice & Pantry', '1 kg bag', 9500, true),
  ('White Sugar', 'Refined sugar for drinks and baking.', 'Rice & Pantry', '1 kg pack', 8500, true),
  ('Iodized Salt', 'Fine iodized salt for everyday cooking.', 'Rice & Pantry', '500 g pack', 2200, true),
  ('All-Purpose Flour', 'Flour for baking, breading, and sauces.', 'Rice & Pantry', '1 kg pack', 6800, true),
  ('Cooking Oil', 'Vegetable oil for frying and sauteing.', 'Rice & Pantry', '1 L bottle', 12500, true),
  ('Soy Sauce', 'Classic seasoning for marinades and dipping.', 'Rice & Pantry', '1 L bottle', 6500, true),
  ('Cane Vinegar', 'Cane vinegar for adobo and dipping sauces.', 'Rice & Pantry', '1 L bottle', 5500, true),
  ('Spaghetti Pasta', 'Dry spaghetti for family pasta meals.', 'Rice & Pantry', '500 g pack', 6500, true),
  ('Sweet Spaghetti Sauce', 'Filipino-style sweet tomato pasta sauce.', 'Rice & Pantry', '500 g pouch', 7800, true),
  ('Sardines in Tomato Sauce', 'Ready-to-heat sardines in tomato sauce.', 'Canned & Instant', '155 g can', 2700, true),
  ('Tuna Flakes in Oil', 'Tuna flakes for sandwiches and quick meals.', 'Canned & Instant', '180 g can', 5800, true),
  ('Corned Beef', 'Canned corned beef for easy breakfasts.', 'Canned & Instant', '150 g can', 7200, true),
  ('Luncheon Meat', 'Slice and pan-fry for a quick meal.', 'Canned & Instant', '350 g can', 9800, true),
  ('Pork and Beans', 'Beans in a savory tomato sauce.', 'Canned & Instant', '230 g can', 4200, true),
  ('Chicken Instant Noodles', 'Chicken-flavored noodle soup.', 'Canned & Instant', '55 g pack', 1200, true),
  ('Pancit Canton', 'Stir-fried-style instant noodles with seasoning.', 'Canned & Instant', '60 g pack', 1600, true),
  ('Rolled Oats', 'Whole-grain oats for breakfast bowls.', 'Breakfast & Dairy', '500 g pack', 11500, true),
  ('Peanut Butter', 'Creamy peanut spread for bread and snacks.', 'Breakfast & Dairy', '340 g jar', 13500, true),
  ('Sliced Bread', 'Soft sliced loaf for toast and sandwiches.', 'Breakfast & Dairy', '400 g loaf', 7200, true),
  ('Fresh Eggs', 'Medium chicken eggs for cooking and baking.', 'Breakfast & Dairy', '12 pieces', 11000, true),
  ('Full Cream Milk', 'UHT full cream milk, ready to drink.', 'Breakfast & Dairy', '1 L carton', 9800, true),
  ('Evaporated Milk', 'Creamy milk for cooking and desserts.', 'Breakfast & Dairy', '370 mL can', 4500, true),
  ('Condensed Milk', 'Sweetened milk for desserts and drinks.', 'Breakfast & Dairy', '300 mL can', 5900, true),
  ('Cheddar Cheese', 'Cheddar-style cheese for sandwiches and pasta.', 'Breakfast & Dairy', '165 g pack', 6800, true),
  ('Bananas', 'Fresh bananas for breakfast or snacks.', 'Fresh Produce', '1 kg', 8500, true),
  ('Red Apples', 'Crisp apples for snacking and lunchboxes.', 'Fresh Produce', '4 pieces', 12000, true),
  ('Potatoes', 'Versatile potatoes for soups and side dishes.', 'Fresh Produce', '1 kg', 11000, true),
  ('Carrots', 'Fresh carrots for stews and stir-fries.', 'Fresh Produce', '500 g', 6500, true),
  ('Red Onions', 'Red onions for sauteing and salads.', 'Fresh Produce', '500 g', 7500, true),
  ('Garlic', 'Garlic bulbs for everyday cooking.', 'Fresh Produce', '250 g', 4500, true),
  ('Tomatoes', 'Fresh tomatoes for sauces and salads.', 'Fresh Produce', '500 g', 5500, true),
  ('Whole Chicken', 'Dressed whole chicken for roasting or soup.', 'Meat & Frozen', '1 kg', 21000, true),
  ('Pork Kasim', 'Pork shoulder cuts for adobo and stews.', 'Meat & Frozen', '500 g', 16500, true),
  ('Frozen Hotdogs', 'Frozen hotdogs for breakfast and snacks.', 'Meat & Frozen', '500 g pack', 9500, true),
  ('Ground Coffee', 'Roasted ground coffee for home brewing.', 'Drinks', '250 g pack', 14500, true),
  ('Instant Coffee Mix', 'Single-serve coffee, creamer, and sugar mix.', 'Drinks', '10 sachets', 8500, true),
  ('Drinking Water', 'Bottled drinking water for the household.', 'Drinks', '6 L bottle', 6500, true),
  ('Dishwashing Liquid', 'Liquid dish soap for everyday washing.', 'Household Essentials', '500 mL bottle', 5500, true),
  ('Laundry Detergent Powder', 'Powder detergent for washing clothes.', 'Household Essentials', '1 kg pack', 9800, true)
) AS seed(name, description, category, unit, price_centavos, available)
WHERE NOT EXISTS (
  SELECT 1 FROM "grocery_products" existing
  WHERE lower(existing."name") = lower(seed.name)
    AND lower(existing."unit") = lower(seed.unit)
);
