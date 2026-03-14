"""
Скрипт для конвертации TON адреса из raw формата в user-friendly формат
"""
try:
    from pytoniq_core import Address
    
    # Ваш текущий адрес из .env
    raw_address = "0QCPAw3mjOVQlc6kTpZoGhvg1OJJWQ4hd-zHVPlCMi8letPt"
    
    print("=" * 60)
    print("TON Address Converter")
    print("=" * 60)
    print(f"\n📍 Raw address: {raw_address}")
    
    # Конвертируем в Address объект
    addr = Address(raw_address)
    
    # Получаем user-friendly форматы
    bounceable = addr.to_str(is_bounceable=True, is_url_safe=True)
    non_bounceable = addr.to_str(is_bounceable=False, is_url_safe=True)
    
    print(f"\n✅ Bounceable (EQ...): {bounceable}")
    print(f"✅ Non-bounceable (UQ...): {non_bounceable}")
    
    print("\n" + "=" * 60)
    print("РЕКОМЕНДАЦИЯ:")
    print("=" * 60)
    print("Используйте NON-BOUNCEABLE адрес (UQ...) в .env:")
    print(f"\nTON_WALLET_ADDRESS={non_bounceable}")
    print("\n" + "=" * 60)
    
except Exception as e:
    print(f"❌ Error: {e}")
    print("\nПопробуйте альтернативный способ:")
    print("1. Откройте TON кошелек в Telegram")
    print("2. Нажмите 'Receive'")
    print("3. Скопируйте адрес (он должен начинаться с UQ или EQ)")
    print("4. Вставьте его в .env как TON_WALLET_ADDRESS")
