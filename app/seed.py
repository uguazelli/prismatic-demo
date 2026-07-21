from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.api_key import hash_api_key
from app.database import SessionLocal
from app.models import Customer, Order, OrderItem, Product, Tenant, TenantApiKey


TENANT_SEEDS = [
    ("Acme Distribution", "odoo-acme", "demo-acme-api-key"),
    ("Globex Wholesale", "odoo-globex", "demo-globex-api-key"),
]


def seed_tenant(db: Session, name: str, odoo_id: str, api_key: str, tenant_number: int) -> bool:
    if db.scalar(select(Tenant).where(Tenant.name == name)):
        return False
    tenant = Tenant(name=name, external_odoo_instance_id=odoo_id)
    db.add(tenant)
    db.flush()
    db.add(TenantApiKey(tenant_id=tenant.id, name="seed", key_hash=hash_api_key(api_key)))

    customers = []
    for index in range(1, 6):
        customer = Customer(
            tenant_id=tenant.id,
            name=f"{name.split()[0]} Customer {index}",
            email=f"customer{index}@tenant{tenant_number}.example",
            phone=f"+1-555-{tenant_number:02d}{index:02d}",
            external_id=f"ODOO-C-{tenant_number}-{index}",
            sync_status="success",
        )
        db.add(customer)
        customers.append(customer)

    products = []
    for index in range(1, 11):
        product = Product(
            tenant_id=tenant.id,
            sku=f"T{tenant_number}-SKU-{index:03d}",
            name=f"Business Product {index}",
            price=Decimal(f"{index * 10}.99"),
            stock_quantity=index * 10,
            external_id=f"ODOO-P-{tenant_number}-{index}",
            sync_status="success",
        )
        db.add(product)
        products.append(product)
    db.flush()

    for order_index, status in enumerate(("draft", "confirmed", "fulfilled"), start=1):
        product_a = products[order_index - 1]
        product_b = products[order_index]
        order = Order(
            tenant_id=tenant.id,
            customer_id=customers[order_index - 1].id,
            status=status,
            total_amount=(product_a.price * 2) + product_b.price,
            external_id=f"ODOO-SO-{tenant_number}-{order_index}",
            sync_status="success",
            invoice_status="invoiced" if status == "fulfilled" else "not_invoiced",
            payment_status="paid" if status == "fulfilled" else "unpaid",
            delivery_status="delivered" if status == "fulfilled" else "pending",
        )
        db.add(order)
        db.flush()
        db.add_all(
            [
                OrderItem(
                    order_id=order.id,
                    product_id=product_a.id,
                    quantity=2,
                    unit_price=product_a.price,
                ),
                OrderItem(
                    order_id=order.id,
                    product_id=product_b.id,
                    quantity=1,
                    unit_price=product_b.price,
                ),
            ]
        )
    return True


def main() -> None:
    with SessionLocal() as db:
        created = 0
        for tenant_number, (name, odoo_id, api_key) in enumerate(TENANT_SEEDS, start=1):
            created += seed_tenant(db, name, odoo_id, api_key, tenant_number)
        db.commit()
    print(f"Seed complete: {created} tenant(s) created")
    print("Acme key:   demo-acme-api-key")
    print("Globex key: demo-globex-api-key")


if __name__ == "__main__":
    main()
