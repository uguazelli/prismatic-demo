"""Initial multi-tenant order management schema.

Revision ID: 20260721_0001
Revises:
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260721_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "tenants",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("external_odoo_instance_id", sa.String(255)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "tenant_api_keys",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("tenant_id", sa.String(36), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("key_hash", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_tenant_api_keys_tenant_id", "tenant_api_keys", ["tenant_id"])
    op.create_index("ix_tenant_api_keys_key_hash", "tenant_api_keys", ["key_hash"], unique=True)
    op.create_table(
        "customers",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("tenant_id", sa.String(36), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("phone", sa.String(50)),
        sa.Column("external_id", sa.String(255)),
        sa.Column("sync_status", sa.String(50), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("tenant_id", "external_id", name="uq_customer_tenant_external"),
    )
    op.create_index("ix_customers_tenant_id", "customers", ["tenant_id"])
    op.create_index("ix_customers_sync_status", "customers", ["sync_status"])
    op.create_index("ix_customer_tenant_email", "customers", ["tenant_id", "email"])
    op.create_table(
        "products",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("tenant_id", sa.String(36), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sku", sa.String(100), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("price", sa.Numeric(12, 2), nullable=False),
        sa.Column("stock_quantity", sa.Integer(), nullable=False),
        sa.Column("external_id", sa.String(255)),
        sa.Column("sync_status", sa.String(50), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("tenant_id", "sku", name="uq_product_tenant_sku"),
        sa.UniqueConstraint("tenant_id", "external_id", name="uq_product_tenant_external"),
    )
    op.create_index("ix_products_tenant_id", "products", ["tenant_id"])
    op.create_index("ix_products_sync_status", "products", ["sync_status"])
    op.create_table(
        "orders",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("tenant_id", sa.String(36), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("customer_id", sa.String(36), sa.ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("status", sa.String(50), nullable=False),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("external_id", sa.String(255)),
        sa.Column("sync_status", sa.String(50), nullable=False),
        sa.Column("invoice_status", sa.String(50)),
        sa.Column("payment_status", sa.String(50)),
        sa.Column("delivery_status", sa.String(50)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("tenant_id", "external_id", name="uq_order_tenant_external"),
    )
    op.create_index("ix_orders_tenant_id", "orders", ["tenant_id"])
    op.create_index("ix_orders_customer_id", "orders", ["customer_id"])
    op.create_index("ix_orders_status", "orders", ["status"])
    op.create_index("ix_orders_sync_status", "orders", ["sync_status"])
    op.create_table(
        "order_items",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("order_id", sa.String(36), sa.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", sa.String(36), sa.ForeignKey("products.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
    )
    op.create_index("ix_order_items_order_id", "order_items", ["order_id"])
    op.create_index("ix_order_items_product_id", "order_items", ["product_id"])
    op.create_table(
        "integration_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("tenant_id", sa.String(36), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_type", sa.String(100), nullable=False),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("entity_id", sa.String(36), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(50), nullable=False),
        sa.Column("retry_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_integration_events_tenant_id", "integration_events", ["tenant_id"])
    op.create_index("ix_integration_events_event_type", "integration_events", ["event_type"])
    op.create_index("ix_integration_events_entity_type", "integration_events", ["entity_type"])
    op.create_index("ix_integration_events_entity_id", "integration_events", ["entity_id"])
    op.create_index("ix_integration_events_status", "integration_events", ["status"])
    op.create_index("ix_event_tenant_created", "integration_events", ["tenant_id", "created_at"])
    op.create_table(
        "idempotency_records",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("tenant_id", sa.String(36), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("endpoint", sa.String(100), nullable=False),
        sa.Column("idempotency_key", sa.String(255), nullable=False),
        sa.Column("response_body", sa.JSON(), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("tenant_id", "endpoint", "idempotency_key", name="uq_idempotency_scope"),
    )
    op.create_index("ix_idempotency_records_tenant_id", "idempotency_records", ["tenant_id"])


def downgrade() -> None:
    op.drop_table("idempotency_records")
    op.drop_table("integration_events")
    op.drop_table("order_items")
    op.drop_table("orders")
    op.drop_table("products")
    op.drop_table("customers")
    op.drop_table("tenant_api_keys")
    op.drop_table("tenants")
