import type { SupabaseClient } from "@supabase/supabase-js";

export async function runTestSeed15Drinks(
  supabase: SupabaseClient
): Promise<"seeded" | "already_exists"> {
  const { count } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);

  if ((count ?? 0) > 0) {
    return "already_exists";
  }

  // 1. Categories
  const { data: cats } = await supabase
    .from("categories")
    .insert([
      { name: "Cà phê", sort_order: 1 },
      { name: "Trà sữa & Matcha", sort_order: 2 },
      { name: "Trà trái cây & Ép", sort_order: 3 },
      { name: "Đá xay & Bánh", sort_order: 4 },
    ])
    .select("id, name");

  const catByName = new Map((cats ?? []).map((c) => [c.name, c.id]));
  const cCoffee = catByName.get("Cà phê") ?? null;
  const cTea = catByName.get("Trà sữa & Matcha") ?? null;
  const cFruit = catByName.get("Trà trái cây & Ép") ?? null;
  const cOther = catByName.get("Đá xay & Bánh") ?? null;

  // 2. Tables & Toppings
  await Promise.all([
    supabase.from("dining_tables").insert([
      { name: "Bàn 1", zone: "Trong nhà", sort_order: 1 },
      { name: "Bàn 2", zone: "Trong nhà", sort_order: 2 },
      { name: "Bàn 3", zone: "Trong nhà", sort_order: 3 },
      { name: "Bàn 4", zone: "Trong nhà", sort_order: 4 },
      { name: "Sân vườn 1", zone: "Ngoài trời", sort_order: 5 },
      { name: "Sân vườn 2", zone: "Ngoài trời", sort_order: 6 },
    ]),
    supabase.from("toppings").insert([
      { name: "Trân châu đường đen", price: 7000 },
      { name: "Kem cheese / Foam milk", price: 9000 },
      { name: "Thạch đào / Vải", price: 7000 },
      { name: "Thêm shot Espresso", price: 10000 },
    ]),
  ]);

  // 3. Ingredients
  const { data: ings } = await supabase
    .from("ingredients")
    .insert([
      {
        name: "Cà phê hạt rang xay",
        sku: "NL-CF01",
        purchase_unit: "Bịch 1kg",
        base_unit: "g",
        conversion_rate: 1000,
        current_stock: 5000,
        min_stock_alert: 1000,
        avg_unit_cost: 220,
      },
      {
        name: "Sữa đặc có đường",
        sku: "NL-SD01",
        purchase_unit: "Lon 380g",
        base_unit: "g",
        conversion_rate: 380,
        current_stock: 3800,
        min_stock_alert: 760,
        avg_unit_cost: 65,
      },
      {
        name: "Sữa tươi không đường",
        sku: "NL-ST01",
        purchase_unit: "Hộp 1L",
        base_unit: "ml",
        conversion_rate: 1000,
        current_stock: 8000,
        min_stock_alert: 2000,
        avg_unit_cost: 36,
      },
      {
        name: "Bột Matcha Nhật",
        sku: "NL-MC01",
        purchase_unit: "Gói 500g",
        base_unit: "g",
        conversion_rate: 500,
        current_stock: 1000,
        min_stock_alert: 200,
        avg_unit_cost: 700,
      },
      {
        name: "Trà đen / Hồng trà",
        sku: "NL-TR01",
        purchase_unit: "Gói 500g",
        base_unit: "g",
        conversion_rate: 500,
        current_stock: 2000,
        min_stock_alert: 400,
        avg_unit_cost: 180,
      },
      {
        name: "Syrup đường / Trái cây",
        sku: "NL-SY01",
        purchase_unit: "Chai 1L",
        base_unit: "ml",
        conversion_rate: 1000,
        current_stock: 4000,
        min_stock_alert: 800,
        avg_unit_cost: 120,
      },
      {
        name: "Ly nhựa + Nắp + Ống hút",
        sku: "NL-LY01",
        purchase_unit: "Lốc 50 cái",
        base_unit: "cái",
        conversion_rate: 50,
        current_stock: 300,
        min_stock_alert: 50,
        avg_unit_cost: 1200,
      },
    ])
    .select("id, sku");

  const ingBySku = new Map((ings ?? []).map((i) => [i.sku, i.id]));
  const ingCoffee = ingBySku.get("NL-CF01");
  const ingCond = ingBySku.get("NL-SD01");
  const ingMilk = ingBySku.get("NL-ST01");
  const ingMatcha = ingBySku.get("NL-MC01");
  const ingTea = ingBySku.get("NL-TR01");
  const ingSyrup = ingBySku.get("NL-SY01");
  const ingCup = ingBySku.get("NL-LY01");

  // 4. 15 Drinks
  const drinkDefs = [
    {
      cat: cCoffee,
      name: "Cà phê đen đá",
      desc: "Đậm vị cà phê rang mộc truyền thống",
      img: "/drinks/01_ca_phe_den_da.jpg",
      price: 22000,
      priceL: 28000,
      recipe: [
        { ing: ingCoffee, qty: 22 },
        { ing: ingCup, qty: 1 },
      ],
    },
    {
      cat: cCoffee,
      name: "Cà phê sữa đá",
      desc: "Cà phê phin hòa quyện sữa đặc béo thơm",
      img: "/drinks/02_ca_phe_sua_da.jpg",
      price: 25000,
      priceL: 32000,
      recipe: [
        { ing: ingCoffee, qty: 20 },
        { ing: ingCond, qty: 35 },
        { ing: ingCup, qty: 1 },
      ],
    },
    {
      cat: cCoffee,
      name: "Bạc xỉu 3 tầng",
      desc: "Sữa tươi nhiều, ngọt dịu nhẹ nhàng",
      img: "/drinks/03_bac_xiu.jpg",
      price: 29000,
      priceL: 35000,
      recipe: [
        { ing: ingCoffee, qty: 15 },
        { ing: ingCond, qty: 30 },
        { ing: ingMilk, qty: 120 },
        { ing: ingCup, qty: 1 },
      ],
    },
    {
      cat: cCoffee,
      name: "Americano đá",
      desc: "Espresso pha loãng mát lạnh thanh nhẹ",
      img: "/drinks/04_americano_da.jpg",
      price: 30000,
      priceL: 36000,
      recipe: [
        { ing: ingCoffee, qty: 18 },
        { ing: ingCup, qty: 1 },
      ],
    },
    {
      cat: cCoffee,
      name: "Latte nóng",
      desc: "Espresso cùng bọt sữa mịn nghệ thuật",
      img: "/drinks/05_latte_nong.jpg",
      price: 38000,
      priceL: 45000,
      recipe: [
        { ing: ingCoffee, qty: 18 },
        { ing: ingMilk, qty: 180 },
      ],
    },
    {
      cat: cTea,
      name: "Matcha Latte đá",
      desc: "Trà xanh Nhật Bản thơm mát béo dịu",
      img: "/drinks/06_matcha_latte.jpg",
      price: 43000,
      priceL: 49000,
      recipe: [
        { ing: ingMatcha, qty: 6 },
        { ing: ingMilk, qty: 160 },
        { ing: ingSyrup, qty: 20 },
        { ing: ingCup, qty: 1 },
      ],
    },
    {
      cat: cTea,
      name: "Trà sữa trân châu đường đen",
      desc: "Hồng trà sữa kèm trân châu dai mềm",
      img: "/drinks/07_tra_sua_tran_chau.jpg",
      price: 37000,
      priceL: 45000,
      recipe: [
        { ing: ingTea, qty: 8 },
        { ing: ingMilk, qty: 120 },
        { ing: ingSyrup, qty: 30 },
        { ing: ingCup, qty: 1 },
      ],
    },
    {
      cat: cFruit,
      name: "Trà đào cam sả",
      desc: "Trà đào thanh mát hương cam sả tự nhiên",
      img: "/drinks/08_tra_dao_cam_sa.jpg",
      price: 35000,
      priceL: 42000,
      recipe: [
        { ing: ingTea, qty: 6 },
        { ing: ingSyrup, qty: 35 },
        { ing: ingCup, qty: 1 },
      ],
    },
    {
      cat: cFruit,
      name: "Trà vải hoa hồng",
      desc: "Vị vải ngọt thanh kết hợp hương hoa hồng",
      img: "/drinks/09_tra_vai.jpg",
      price: 35000,
      priceL: 42000,
      recipe: [
        { ing: ingTea, qty: 6 },
        { ing: ingSyrup, qty: 35 },
        { ing: ingCup, qty: 1 },
      ],
    },
    {
      cat: cFruit,
      name: "Trà chanh sả tắc",
      desc: "Giải nhiệt sảng khoái chua ngọt dịu",
      img: "/drinks/10_tra_chanh_sa_tac.jpg",
      price: 25000,
      priceL: 30000,
      recipe: [
        { ing: ingTea, qty: 5 },
        { ing: ingSyrup, qty: 30 },
        { ing: ingCup, qty: 1 },
      ],
    },
    {
      cat: cOther,
      name: "Sinh tố xoài",
      desc: "Xoài chín xay mịn mát lạnh tự nhiên",
      img: "/drinks/11_sinh_to_xoai.jpg",
      price: 39000,
      priceL: 46000,
      recipe: [{ ing: ingCup, qty: 1 }],
    },
    {
      cat: cOther,
      name: "Đá xay Socola kem tươi",
      desc: "Socola đậm vị phủ kem tươi béo ngậy",
      img: "/drinks/12_da_xay_socola.jpg",
      price: 45000,
      priceL: 52000,
      recipe: [
        { ing: ingMilk, qty: 100 },
        { ing: ingCup, qty: 1 },
      ],
    },
    {
      cat: cFruit,
      name: "Soda việt quất bạc hà",
      desc: "Soda có ga mát lạnh hương việt quất",
      img: "/drinks/13_soda_viet_quat.jpg",
      price: 32000,
      priceL: 38000,
      recipe: [
        { ing: ingSyrup, qty: 30 },
        { ing: ingCup, qty: 1 },
      ],
    },
    {
      cat: cFruit,
      name: "Nước cam ép tươi",
      desc: "Cam tươi vắt 100% bổ sung vitamin C",
      img: "/drinks/14_nuoc_cam_ep.jpg",
      price: 35000,
      priceL: 42000,
      recipe: [{ ing: ingCup, qty: 1 }],
    },
    {
      cat: cOther,
      name: "Bánh Croissant bơ",
      desc: "Bánh sừng bò nướng giòn thơm bơ Pháp",
      img: "/drinks/15_croissant.jpg",
      price: 28000,
      priceL: 0,
      recipe: [],
    },
  ];

  const { data: insertedProds } = await supabase
    .from("products")
    .insert(
      drinkDefs.map((d) => ({
        category_id: d.cat,
        name: d.name,
        description: d.desc,
        image_url: d.img,
        base_price: d.price,
        is_available: true,
        is_active: true,
      }))
    )
    .select("id, name");

  const prodByName = new Map((insertedProds ?? []).map((p) => [p.name, p.id]));
  const variantsToInsert: {
    product_id: string;
    name: string;
    price: number;
    is_default: boolean;
  }[] = [];
  const recipesToInsert: {
    product_id: string;
    ingredient_id: string;
    quantity_required: number;
  }[] = [];

  for (const d of drinkDefs) {
    const pid = prodByName.get(d.name);
    if (!pid) continue;
    if (d.priceL > 0) {
      variantsToInsert.push(
        { product_id: pid, name: "M", price: d.price, is_default: true },
        { product_id: pid, name: "L", price: d.priceL, is_default: false }
      );
    }
    for (const r of d.recipe) {
      if (r.ing) {
        recipesToInsert.push({
          product_id: pid,
          ingredient_id: r.ing,
          quantity_required: r.qty,
        });
      }
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const nextMonthDate = new Date();
  nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
  nextMonthDate.setDate(1);
  const nextMonthStr = nextMonthDate.toISOString().slice(0, 10);

  await Promise.all([
    variantsToInsert.length > 0
      ? supabase.from("product_variants").insert(variantsToInsert)
      : Promise.resolve(),
    recipesToInsert.length > 0
      ? supabase.from("recipes").insert(recipesToInsert)
      : Promise.resolve(),
    supabase.from("expenses").insert([
      {
        expense_group: "rent",
        title: "Tiền thuê mặt bằng tháng này",
        amount: 8000000,
        expense_date: today,
        billing_month: month,
        allocated_months: 1,
      },
      {
        expense_group: "electricity",
        title: "Tiền điện quán (1420 -> 1850 kWh)",
        amount: 1505000,
        expense_date: today,
        billing_month: month,
        meter_old: 1420,
        meter_new: 1850,
        unit_price: 3500,
        allocated_months: 1,
      },
      {
        expense_group: "water",
        title: "Tiền nước sinh hoạt tháng",
        amount: 220000,
        expense_date: today,
        billing_month: month,
        allocated_months: 1,
      },
    ]),
    supabase.from("recurring_expenses").insert([
      {
        title: "Tiền thuê mặt bằng quán",
        expense_group: "rent",
        amount: 8000000,
        billing_cycle_months: 1,
        next_due_date: nextMonthStr,
        reminder_days_before: 5,
        note: "Đóng đầu mỗi tháng",
      },
      {
        title: "Internet Wifi quán",
        expense_group: "internet",
        amount: 250000,
        billing_cycle_months: 1,
        next_due_date: nextMonthStr,
        reminder_days_before: 3,
        note: "Gói cáp quang",
      },
    ]),
  ]);

  return "seeded";
}
