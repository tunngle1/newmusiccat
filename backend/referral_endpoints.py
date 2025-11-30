# Referral System Endpoints

from datetime import timedelta

@app.get("/api/referral/code")
async def get_referral_code(user_id: int = Query(...), db: Session = Depends(get_db)):
    """Get user's referral code and link"""
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Generate referral code if doesn't exist
    if not user.referral_code:
        user.referral_code = f"REF{user_id}"
        db.commit()
    
    # Get bot username from environment or use placeholder
    bot_username = os.getenv("BOT_USERNAME", "your_bot")
    
    return {
        "code": user.referral_code,
        "link": f"https://t.me/{bot_username}?start={user.referral_code}",
        "referrals_count": db.query(Referral).filter(Referral.referrer_id == user_id).count(),
        "completed_referrals": db.query(Referral).filter(
            Referral.referrer_id == user_id,
            Referral.status == 'completed'
        ).count()
    }


@app.post("/api/referral/register")
async def register_referral(
    user_id: int = Query(...),
    referral_code: str = Query(...),
    db: Session = Depends(get_db)
):
    """Register a new user as referred by someone"""
    # Find referrer by code
    referrer = db.query(User).filter(User.referral_code == referral_code).first()
    
    if not referrer:
        raise HTTPException(status_code=400, detail="Invalid referral code")
    
    if referrer.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot refer yourself")
    
    # Get or create user
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if already referred
    if user.referred_by:
        raise HTTPException(status_code=400, detail="User already has a referrer")
    
    # Check if referral already exists
    existing = db.query(Referral).filter(
        Referral.referred_id == user_id
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Referral already registered")
    
    # Create referral record
    user.referred_by = referrer.id
    
    referral = Referral(
        referrer_id=referrer.id,
        referred_id=user_id,
        status='pending',
        reward_given=False
    )
    db.add(referral)
    db.commit()
    
    return {
        "status": "ok",
        "referrer_id": referrer.id,
        "message": "Referral registered successfully"
    }


@app.get("/api/referral/stats")
async def get_referral_stats(user_id: int = Query(...), db: Session = Depends(get_db)):
    """Get referral statistics for a user"""
    total = db.query(Referral).filter(Referral.referrer_id == user_id).count()
    completed = db.query(Referral).filter(
        Referral.referrer_id == user_id,
        Referral.status == 'completed'
    ).count()
    pending = total - completed
    
    # Get list of referrals with details
    referrals = db.query(Referral).filter(Referral.referrer_id == user_id).all()
    referral_list = []
    
    for ref in referrals:
        referred_user = db.query(User).filter(User.id == ref.referred_id).first()
        if referred_user:
            referral_list.append({
                "id": ref.id,
                "user_id": referred_user.id,
                "username": referred_user.username,
                "first_name": referred_user.first_name,
                "status": ref.status,
                "reward_given": ref.reward_given,
                "created_at": ref.created_at.isoformat() if ref.created_at else None,
                "completed_at": ref.completed_at.isoformat() if ref.completed_at else None
            })
    
    return {
        "total_referrals": total,
        "completed_referrals": completed,
        "pending_referrals": pending,
        "referrals": referral_list
    }


def extend_premium(user: User, days: int, db: Session):
    """Extend user's premium subscription by specified days"""
    now = datetime.utcnow()
    
    # If user has active premium, extend from expiration date
    # Otherwise, extend from now
    if user.premium_expires_at and user.premium_expires_at > now:
        user.premium_expires_at += timedelta(days=days)
    else:
        user.premium_expires_at = now + timedelta(days=days)
    
    # Set premium flag
    user.is_premium = True
    db.commit()
    
    return user.premium_expires_at


@app.post("/api/payment/complete")
async def complete_payment(
    user_id: int = Query(...),
    plan: str = Query(...),  # 'month' or 'year'
    db: Session = Depends(get_db)
):
    """
    Mark payment as complete and grant premium.
    This should be called from Tribute webhook or payment verification.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Determine premium duration
    days = 30 if plan == 'month' else 365
    
    # Extend premium
    expires_at = extend_premium(user, days, db)
    
    # Check if this user was referred and reward referrer
    if user.referred_by:
        referral = db.query(Referral).filter(
            Referral.referred_id == user_id,
            Referral.status == 'pending'
        ).first()
        
        if referral and not referral.reward_given:
            # Get referrer
            referrer = db.query(User).filter(User.id == referral.referrer_id).first()
            
            if referrer:
                # Give 30 days premium to referrer
                referrer_expires = extend_premium(referrer, 30, db)
                
                # Update referral status
                referral.status = 'completed'
                referral.reward_given = True
                referral.completed_at = datetime.utcnow()
                db.commit()
                
                # Send notification to referrer
                if BOT_TOKEN:
                    try:
                        import httpx
                        telegram_url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
                        async with httpx.AsyncClient() as client:
                            await client.post(telegram_url, json={
                                'chat_id': referrer.id,
                                'text': f"🎉 Ваш реферал оформил подписку! Вы получили +30 дней Premium до {referrer_expires.strftime('%d.%m.%Y')}!"
                            })
                    except Exception as e:
                        print(f"Failed to send referral notification: {e}")
    
    return {
        "status": "ok",
        "premium_expires_at": expires_at.isoformat(),
        "is_premium": True
    }
