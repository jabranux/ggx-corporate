import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  IconArrowLeft, IconArrowRight, IconCheck, IconX, IconUser, IconMapPin,
  IconPackage, IconCash, IconBolt, IconTruckDelivery, IconShoppingBag,
} from '@tabler/icons-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { ConfirmDialog } from '../components/ui/Dialog';
import { OnDemandBadge, OnDemandRoute, OnDemandTimeline } from '../components/OnDemandTracker';
import { OnDemandMap } from '../components/OnDemandMap';
import {
  getOrderById,
  acceptStorefrontOrder,
  rejectStorefrontOrder,
  advanceStorefrontDelivery,
  STOREFRONT_ORDER_STATUS_META,
  type StorefrontOrder,
} from '../services/storefrontOrdersService';
import {
  getOnDemandProgress,
  OD_STAGE_DEFS,
  SERVICE_TYPE_SHORT_LABEL,
  serviceTypeLabel,
  type DeliveryServiceType,
} from '../services/transactionService';
import { nextDeliveryStage } from '../data/onDemandDelivery';

const peso = (n: number) => `₱${n.toLocaleString('en-PH')}`;

const SERVICE_BADGE: Record<DeliveryServiceType, string> = {
  standard: 'bg-blue-100 text-blue-800',
  same_day: 'bg-orange-100 text-orange-800',
  on_demand: 'bg-violet-100 text-violet-800',
};

const CHANNEL_LABEL: Record<StorefrontOrder['channel'], string> = {
  storefront_checkout: 'Storefront Checkout',
  product_checkout: 'Single Product Checkout',
};

/**
 * StorefrontOrderDetail — seller view of one buyer order. Shows the buyer/order
 * summary and (separately) the delivery status. The seller can accept (which
 * books the delivery and, for On-Demand, starts "Looking for driver"), reject,
 * and — for accepted OD orders — walk the OD delivery lifecycle for the demo.
 */
export function StorefrontOrderDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [order, setOrder] = useState<StorefrontOrder | null | undefined>(undefined);
  const [showReject, setShowReject] = useState(false);

  useEffect(() => {
    let active = true;
    getOrderById(id ?? '').then((o) => { if (active) setOrder(o); });
    return () => { active = false; };
  }, [id]);

  if (order === undefined) {
    return <div className="p-6 text-sm text-gray-400">Loading order…</div>;
  }
  if (!order) {
    return (
      <div className="p-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/transactions?view=store-orders')}>
          <IconArrowLeft className="w-4 h-4 mr-2" /> Back to Store Orders
        </Button>
        <Card className="mt-6">
          <CardContent className="p-12 text-center">
            <IconShoppingBag className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900">Order not found</h2>
            <p className="text-sm text-gray-500 mt-1">No order matches <span className="font-medium">{id}</span>.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const meta = STOREFRONT_ORDER_STATUS_META[order.status];
  const isOD = order.serviceType === 'on_demand';
  const accepted = order.status === 'accepted';
  const awaiting = order.status === 'awaiting_acceptance';
  const progress = accepted && isOD && order.deliveryStage ? getOnDemandProgress(order.deliveryStage) : null;
  const canAdvance = accepted && isOD && order.deliveryStage && !!nextDeliveryStage(order.deliveryStage);

  const handleAccept = async () => {
    const updated = await acceptStorefrontOrder(order.id);
    if (updated) setOrder({ ...updated });
  };
  const handleReject = async () => {
    const updated = await rejectStorefrontOrder(order.id);
    if (updated) setOrder({ ...updated });
    setShowReject(false);
  };
  const handleAdvance = async () => {
    const updated = await advanceStorefrontDelivery(order.id);
    if (updated) setOrder({ ...updated });
  };

  return (
    <div className="p-6 space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/transactions?view=store-orders')}>
        <IconArrowLeft className="w-4 h-4 mr-2" /> Back to Store Orders
      </Button>

      {/* Header — order status + delivery status shown SEPARATELY */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Order {order.id}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {order.storeName} · {CHANNEL_LABEL[order.channel]} · Placed {order.placedAt}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Order status</span>
            <Badge variant={meta.variant}>{meta.label}</Badge>
            {accepted && (
              <>
                <span className="mx-1 text-gray-300">·</span>
                <span className="text-xs text-gray-400 uppercase tracking-wide">Delivery</span>
                {isOD && order.deliveryStage
                  ? <Badge className="bg-violet-100 text-violet-800">{OD_STAGE_DEFS[order.deliveryStage].label}</Badge>
                  : <Badge variant="info">Booked for delivery</Badge>}
              </>
            )}
          </div>
        </div>
        {awaiting && (
          <div className="flex gap-2">
            <Button onClick={handleAccept}>
              <IconCheck className="w-4 h-4 mr-1.5" /> Accept order
            </Button>
            <Button variant="outline" className="text-red-600 hover:bg-red-50" onClick={() => setShowReject(true)}>
              <IconX className="w-4 h-4 mr-1.5" /> Reject
            </Button>
          </div>
        )}
      </div>

      {awaiting && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This order is waiting for your acceptance. Accepting it books a delivery
          {isOD ? ' and starts looking for an On-Demand driver.' : '.'}
        </div>
      )}
      {order.status === 'rejected' && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          This order was rejected and was not booked for delivery.
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* OD delivery progress — only once accepted */}
          {progress && (
            <Card className="border-violet-200">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center">
                      <IconBolt className="w-5 h-5 text-violet-600" />
                    </span>
                    <div>
                      <CardTitle>On-Demand delivery</CardTitle>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {progress.currentLabel}<span className="mx-1.5 text-gray-300">·</span>
                        <span className="font-medium text-violet-700">{progress.eta}</span>
                      </p>
                    </div>
                  </div>
                  <OnDemandBadge />
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <OnDemandMap progress={progress} />
                <OnDemandRoute
                  pickup={{ name: order.storeName, address: 'Seller pickup location' }}
                  dropoff={{ name: order.buyer.name, address: order.buyer.address }}
                />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Delivery progress</p>
                  <OnDemandTimeline progress={progress} />
                </div>
                {/* Demo lifecycle progression */}
                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  {canAdvance ? (
                    <Button onClick={handleAdvance}>
                      <IconTruckDelivery className="w-4 h-4 mr-1.5" />
                      Advance to: {OD_STAGE_DEFS[nextDeliveryStage(order.deliveryStage!)!].label}
                    </Button>
                  ) : (
                    <Button disabled variant="outline">
                      <IconCheck className="w-4 h-4 mr-1.5" /> Delivered
                    </Button>
                  )}
                  {order.trackingNumber && (
                    <Button variant="outline" onClick={() => navigate(`/dashboard/transactions/${order.trackingNumber}`)}>
                      View delivery transaction
                      <IconArrowRight className="w-4 h-4 ml-1.5" />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-gray-400">
                  Demo control — steps the mocked On-Demand delivery through its lifecycle. No real dispatch.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Order items */}
          <Card>
            <CardHeader><CardTitle>Order items</CardTitle></CardHeader>
            <CardContent>
              <div className="divide-y divide-gray-100">
                {order.items.map((it, i) => (
                  <div key={i} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <IconPackage className="w-4 h-4 text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{it.name}</p>
                      {it.variantLabel && <p className="text-xs text-gray-500 truncate">{it.variantLabel}{it.sku ? ` · SKU ${it.sku}` : ''}</p>}
                      <p className="text-xs text-gray-500">Qty {it.quantity} · {peso(it.unitPrice)} each</p>
                    </div>
                    <p className="text-sm font-semibold text-gray-900">{peso(it.unitPrice * it.quantity)}</p>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-200 mt-3 pt-3 flex justify-between font-semibold">
                <span className="text-gray-900 inline-flex items-center gap-1.5">
                  <IconCash className="w-4 h-4 text-emerald-600" /> Total (COD)
                </span>
                <span className="text-gray-900">{peso(order.codTotal)}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {/* Buyer */}
          <Card>
            <CardHeader><CardTitle>Buyer</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-start gap-2">
                <IconUser className="w-4 h-4 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-gray-900 font-medium">{order.buyer.name}</p>
                  <p className="text-gray-500">{order.buyer.mobile}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <IconMapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                <p className="text-gray-700">{order.buyer.address}</p>
              </div>
            </CardContent>
          </Card>

          {/* Delivery preference */}
          <Card>
            <CardHeader><CardTitle>Delivery preference</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Service</span>
                <Badge className={SERVICE_BADGE[order.serviceType]}>{SERVICE_TYPE_SHORT_LABEL[order.serviceType]}</Badge>
              </div>
              <p className="text-xs text-gray-500">{serviceTypeLabel(order.serviceType)}</p>
              <div className="flex items-center justify-between pt-1">
                <span className="text-gray-600">Payment</span>
                <span className="text-gray-900">Cash on Delivery</span>
              </div>
              {order.trackingNumber && (
                <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                  <span className="text-gray-600">Tracking #</span>
                  <span className="text-gray-900 font-medium">{order.trackingNumber}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {accepted && (
            <Button
              variant="ghost"
              className="w-full text-red-600 hover:bg-red-50"
              onClick={() => setShowReject(true)}
            >
              <IconX className="w-4 h-4 mr-1.5" /> Cancel order
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={showReject}
        onClose={() => setShowReject(false)}
        onConfirm={handleReject}
        title={awaiting ? 'Reject this order?' : 'Cancel this order?'}
        description={
          <>
            Order <span className="font-medium text-gray-700">{order.id}</span> will be marked rejected
            {accepted ? ' and its delivery cancelled' : ''}. This is a demo action.
          </>
        }
        confirmLabel={awaiting ? 'Reject order' : 'Cancel order'}
        variant="destructive"
        confirmIcon={<IconX className="w-3.5 h-3.5 mr-1.5" />}
      />
    </div>
  );
}
