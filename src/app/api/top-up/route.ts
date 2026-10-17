import { NextResponse } from 'next/server';

// Diamonds Quantity ke hisab se FoxReload Product IDs Map
const FOXRELOAD_PRODUCT_MAP: Record<number, string> = {
  30: 'product_01ktef44c8ffsb51hp5wtkgd34',   // 30 Diamonds
  100: 'product_01ktef44hbfj18ejnxghdzz05t',  // 100 Diamonds
  517: 'product_01ktef48htfjhvem3zp9nszbt9',  // 517 Diamonds
  // Agar koi aur pack add karna ho to yahan 'diamonds_count: product_id' format mein add kar sakte hain
};

export async function POST(req: Request) {
  try {
    const { playerId, diamonds, productId } = await req.json();

    // Pehle map se ID dhoondo, warna front-end ki direct ID use karo
    const foxreloadId = FOXRELOAD_PRODUCT_MAP[diamonds] || productId;

    if (!playerId || !foxreloadId) {
      return NextResponse.json(
        { error: 'Player ID aur Valid Product ID required hain' },
        { status: 400 }
      );
    }

    const response = await fetch('https://b2b.foxreload.com/api/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': process.env.FOXRELOAD_API_KEY || '',
      },
      body: JSON.stringify({
        product_id: foxreloadId,
        player_id: playerId,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.message || 'Order process nahi ho saka' },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Order successful!',
      data: data,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
