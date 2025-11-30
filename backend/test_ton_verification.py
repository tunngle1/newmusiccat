"""
Тестовый скрипт для проверки декодирования TON BOC и верификации транзакций.
"""
import asyncio
import os
from dotenv import load_dotenv

# Загружаем переменные окружения
load_dotenv()

async def test_boc_decoding():
    """Тест декодирования BOC"""
    print("=" * 60)
    print("TEST 1: BOC Decoding")
    print("=" * 60)
    
    try:
        from pytoniq_core import Cell
        import base64
        
        # Пример простого BOC (пустая ячейка)
        # В реальности BOC будет приходить от TonConnect после отправки транзакции
        test_boc_base64 = "te6ccgEBAQEAAgAAAA=="  # Пустая ячейка для теста
        
        print(f"📦 Test BOC (base64): {test_boc_base64}")
        
        # Декодируем
        boc_bytes = base64.b64decode(test_boc_base64)
        cell = Cell.one_from_boc(boc_bytes)
        
        # Получаем хэш
        cell_hash = cell.hash.hex()
        
        print(f"✅ BOC decoded successfully!")
        print(f"🔑 Cell hash: {cell_hash}")
        
        return True
        
    except Exception as e:
        print(f"❌ BOC decoding failed: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_ton_api_connection():
    """Тест подключения к TON API"""
    print("\n" + "=" * 60)
    print("TEST 2: TON API Connection")
    print("=" * 60)
    
    try:
        import httpx
        
        ton_api_url = os.getenv("TON_API_URL", "https://testnet.tonapi.io")
        api_key = os.getenv("TON_API_KEY", "")
        
        print(f"🌐 API URL: {ton_api_url}")
        print(f"🔑 API Key: {'Set' if api_key else 'Not set (using public access)'}")
        
        headers = {"Accept": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        
        # Тестовый запрос к API (получение информации о блокчейне)
        test_endpoint = f"{ton_api_url}/v2/status"
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(test_endpoint, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                print(f"✅ API connection successful!")
                print(f"📊 Response: {data}")
                return True
            else:
                print(f"❌ API returned status {response.status_code}")
                print(f"Response: {response.text}")
                return False
                
    except Exception as e:
        print(f"❌ API connection failed: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_wallet_address():
    """Проверка адреса кошелька из .env"""
    print("\n" + "=" * 60)
    print("TEST 3: Wallet Address Configuration")
    print("=" * 60)
    
    wallet_address = os.getenv("TON_WALLET_ADDRESS", "")
    
    if not wallet_address or wallet_address == "UQBtZ_...":
        print(f"⚠️  WARNING: TON_WALLET_ADDRESS not configured in .env")
        print(f"   Current value: {wallet_address}")
        print(f"   Please set your actual testnet wallet address")
        return False
    else:
        print(f"✅ Wallet address configured")
        print(f"📍 Address: {wallet_address}")
        return True


async def main():
    """Запуск всех тестов"""
    print("\n" + "🧪" * 30)
    print("TON Payment Verification - Test Suite")
    print("🧪" * 30 + "\n")
    
    results = []
    
    # Тест 1: Декодирование BOC
    results.append(await test_boc_decoding())
    
    # Тест 2: Подключение к API
    results.append(await test_ton_api_connection())
    
    # Тест 3: Проверка адреса кошелька
    results.append(await test_wallet_address())
    
    # Итоги
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    
    passed = sum(results)
    total = len(results)
    
    print(f"✅ Passed: {passed}/{total}")
    print(f"❌ Failed: {total - passed}/{total}")
    
    if passed == total:
        print("\n🎉 All tests passed! Ready for real transaction verification.")
    else:
        print("\n⚠️  Some tests failed. Please check the configuration.")
    
    print("\n" + "=" * 60)
    print("NEXT STEPS:")
    print("=" * 60)
    print("1. Install dependencies: pip install -r requirements.txt")
    print("2. Configure TON_WALLET_ADDRESS in backend/.env")
    print("3. Restart the backend server")
    print("4. Test with real payment from second Telegram account")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
