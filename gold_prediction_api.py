from flask import Flask, jsonify
from flask_cors import CORS
import pandas as pd
import numpy as np
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import PolynomialFeatures
import requests
import warnings
from datetime import datetime
import os
from dotenv import load_dotenv
warnings.filterwarnings('ignore')

# Load environment variables from .env file in the server directory
load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env'))

app = Flask(__name__)
CORS(app)

@app.route('/api/realtime-gold-price', methods=['GET'])
def realtime_gold_price():
    try:
        # Get real-time gold price using GoldAPI.io (Recommended for India)
        # This provides actual market data for gold prices in INR
        goldapi_key = os.getenv("GOLDAPI_IO_KEY")
        
        # Try multiple sources for real-time gold price in order of preference
        gold_price = None
        data_source = 'fallback'
        
        # Method 0: MetalPriceAPI (User provided)
        metalprice_api_key = os.getenv("METALPRICE_API_KEY")
        if metalprice_api_key:
            try:
                url = f"https://api.metalpriceapi.com/v1/latest?api_key={metalprice_api_key}&base=USD&currencies=INR,XAU"
                response = requests.get(url, timeout=10)
                if response.status_code == 200:
                    data = response.json()
                    # Gold price per ounce in USD. Rates returning XAU amount per USD
                    # 1 USD = XAU amount. So 1 XAU = 1/XAU amount USD.
                    gold_per_ounce_usd = 1 / data['rates']['XAU']
                    # Convert to per 10g (1 ounce = 31.1035 grams)
                    # Convert to INR using the provided rate
                    gold_price_per_10g_inr = (gold_per_ounce_usd / 31.1035) * 10 * data['rates']['INR']
                    gold_price = round(gold_price_per_10g_inr, 2)
                    data_source = 'metalpriceapi'
            except Exception as e:
                print(f"MetalPriceAPI Error: {e}")

        # Method 1: GoldAPI.io (Direct INR price)
        if gold_price is None:
            goldapi_key = os.getenv("GOLDAPI_IO_KEY")
            if goldapi_key and goldapi_key != "your_goldapi_io_key_here":
                try:
                    # Get Gold price specifically for India (INR)
                    url = "https://www.goldapi.io/api/XAU/INR"
                    headers = {
                        "x-access-token": goldapi_key,
                        "Content-Type": "application/json"
                    }
                    response = requests.get(url, headers=headers, timeout=10)
                    if response.status_code == 200:
                        data = response.json()
                        # GoldAPI returns price per gram or ounce. 
                        # For XAU/INR, it returns price per ounce.
                        raw_price = data.get('price')
                        if raw_price:
                            # Convert to per 10g (1 ounce = 31.1035 grams)
                            gold_price_per_10g = (raw_price / 31.1035) * 10
                            gold_price = round(gold_price_per_10g, 2)
                            data_source = 'goldapi_io'
                except Exception as e:
                    print(f"GoldAPI Error: {e}")
        
        # Method 2: Metals-API (free alternative)
        if gold_price is None:
            try:
                url = "https://api.metals.live/v1/spot/gold"
                response = requests.get(url, timeout=5)
                if response.status_code == 200:
                    data = response.json()
                    if 'price' in data:
                        # Convert USD to INR - Try to get dynamic rate if possible
                        usd_to_inr = 91.07 # Updated more recent rate
                        gold_price_usd = data['price']
                        gold_price_inr = gold_price_usd * usd_to_inr
                        
                        # Convert to per 10g
                        gold_price_per_10g = (gold_price_inr / 31.1035) * 10
                        gold_price = round(gold_price_per_10g, 2)
                        data_source = 'metals_live'
            except:
                pass
        
        # Method 3: Fallback to our historical data with realistic fluctuation
        if gold_price is None:
            import os
            import random
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            csv_path = os.path.join(base_dir, 'client', 'app', 'data', 'gold_inr_monthly.csv')
            df = pd.read_csv(csv_path)
            base_price = float(df['price_inr_per_10g'].iloc[-1])
            
            # More realistic fluctuation based on market hours
            current_hour = datetime.now().hour
            if 9 <= current_hour <= 16:  # Market hours
                fluctuation_percent = random.uniform(-1.5, 1.5)
            else:  # After hours
                fluctuation_percent = random.uniform(-0.5, 0.5)
            
            gold_price = base_price * (1 + fluctuation_percent / 100)
            gold_price = round(gold_price, 2)
        
        # Get base price for comparison
        import os
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        csv_path = os.path.join(base_dir, 'client', 'app', 'data', 'gold_inr_monthly.csv')
        df = pd.read_csv(csv_path)
        base_price = float(df['price_inr_per_10g'].iloc[-1])
        
        # Calculate change from base price
        price_change = gold_price - base_price
        price_change_percent = (price_change / base_price) * 100
        
        response = {
            'success': True,
            'currentPrice': gold_price,
            'basePrice': round(base_price, 2),
            'priceChange': round(price_change, 2),
            'priceChangePercent': round(price_change_percent, 2),
            'lastUpdated': datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC'),
            'currency': 'INR',
            'unit': 'per 10 grams',
            'dataSource': data_source
        }
        
        return jsonify(response)
    
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/predict-gold', methods=['GET'])
def predict_gold():
    try:
        # Load the data - use absolute path from server directory
        import os
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        csv_path = os.path.join(base_dir, 'client', 'app', 'data', 'gold_inr_monthly.csv')
        df = pd.read_csv(csv_path)
        
        # Convert month to datetime and create numeric features
        df['month'] = pd.to_datetime(df['month'])
        df['month_num'] = range(1, len(df) + 1)
        
        # Prepare features and target
        X = df[['month_num']].values
        y = df['price_inr_per_10g'].values
        
        # Create polynomial features for better fitting
        poly = PolynomialFeatures(degree=2)
        X_poly = poly.fit_transform(X)
        
        # Train the model
        model = LinearRegression()
        model.fit(X_poly, y)
        
        # Get last actual price and month
        last_actual_price = float(df['price_inr_per_10g'].iloc[-1])
        last_month = df['month'].iloc[-1]
        
        # Determine starting point for predictions (today)
        now = datetime.now()
        current_year_month = pd.Timestamp(year=now.year, month=now.month, day=1)
        
        # Calculate months elapsed since the last data point in CSV
        months_since_last = (now.year - last_month.year) * 12 + (now.month - last_month.month)
        
        # Predict next 6 months starting from the NEXT month
        predictions = []
        for i in range(1, 7):
            # Calculate the month index for prediction
            # months_since_last is the gap between CSV end and today
            # We want to predict starting from next month
            prediction_month_num = len(df) + months_since_last + i
            
            future_X = np.array([[prediction_month_num]])
            future_X_poly = poly.transform(future_X)
            predicted_price = float(model.predict(future_X_poly)[0])
            
            # Month for which we are predicting
            prediction_date = current_year_month + pd.DateOffset(months=i)
            
            # Calculate change
            if i == 1:
                # Change from today's live price (to be calculated below)
                # We'll placeholder it for now and update after getting realtime_data
                change = 0 
                change_pct = 0
            else:
                change = predicted_price - predictions[-1]['price']
                change_pct = (change / predictions[-1]['price']) * 100
            
            predictions.append({
                'month': prediction_date.strftime('%B %Y'),
                'monthShort': prediction_date.strftime('%b %Y'),
                'price': round(predicted_price, 2),
                'change': round(change, 2),
                'changePct': round(change_pct, 2)
            })
        
        # Get recent historical data (last 6 months)
        recent_history = []
        for idx in range(max(0, len(df) - 6), len(df)):
            row = df.iloc[idx]
            recent_history.append({
                'month': row['month'].strftime('%B %Y'),
                'monthShort': row['month'].strftime('%b %Y'),
                'price': float(row['price_inr_per_10g'])
            })
        
        # Calculate summary statistics
        avg_predicted = round(np.mean([p['price'] for p in predictions]), 2)
        min_predicted = round(min([p['price'] for p in predictions]), 2)
        max_predicted = round(max([p['price'] for p in predictions]), 2)
        expected_change = round(predictions[-1]['price'] - last_actual_price, 2)
        expected_change_pct = round((expected_change / last_actual_price) * 100, 2)
        # Get real-time price data
        try:
            # Try multiple sources for real-time gold price in order of preference
            gold_price = None
            data_source = 'fallback'
            metalprice_api_key = os.getenv("METALPRICE_API_KEY")
            
            # Method 0: MetalPriceAPI (User provided)
            if metalprice_api_key:
                try:
                    url = f"https://api.metalpriceapi.com/v1/latest?api_key={metalprice_api_key}&base=USD&currencies=INR,XAU"
                    response = requests.get(url, timeout=10)
                    if response.status_code == 200:
                        data = response.json()
                        gold_per_ounce_usd = 1 / data['rates']['XAU']
                        gold_price_per_10g_inr = (gold_per_ounce_usd / 31.1035) * 10 * data['rates']['INR']
                        gold_price = round(gold_price_per_10g_inr, 2)
                        data_source = 'metalpriceapi'
                except:
                    pass

            # Method 1: GoldAPI.io (Direct INR price)
            if gold_price is None:
                goldapi_key = os.getenv("GOLDAPI_IO_KEY")
                if goldapi_key and goldapi_key != "your_goldapi_io_key_here":
                    try:
                        url = "https://www.goldapi.io/api/XAU/INR"
                        headers = {"x-access-token": goldapi_key, "Content-Type": "application/json"}
                        response = requests.get(url, headers=headers, timeout=5)
                        if response.status_code == 200:
                            data = response.json()
                            raw_price = data.get('price')
                            if raw_price:
                                gold_price_per_10g = (raw_price / 31.1035) * 10
                                gold_price = round(gold_price_per_10g, 2)
                                data_source = 'goldapi_io'
                    except:
                        pass
            
            # Method 2: Metals-API
            if gold_price is None:
                try:
                    url = "https://api.metals.live/v1/spot/gold"
                    response = requests.get(url, timeout=5)
                    if response.status_code == 200:
                        data = response.json()
                        if 'price' in data:
                            usd_to_inr = 83.5
                            gold_price_usd = data['price']
                            gold_price_inr = gold_price_usd * usd_to_inr
                            gold_price_per_10g = (gold_price_inr / 31.1035) * 10
                            gold_price = round(gold_price_per_10g, 2)
                            data_source = 'metals_live'
                except:
                    pass
            
            # Method 3: Realistic fallback
            if gold_price is None:
                import random
                current_hour = datetime.now().hour
                if 9 <= current_hour <= 16:  # Market hours
                    fluctuation_percent = random.uniform(-1.5, 1.5)
                else:  # After hours
                    fluctuation_percent = random.uniform(-0.5, 0.5)
                gold_price = last_actual_price * (1 + fluctuation_percent / 100)
                gold_price = round(gold_price, 2)
            
            # Calculate change from base price
            realtime_change = gold_price - last_actual_price
            realtime_change_percent = (realtime_change / last_actual_price) * 100
            
            realtime_data = {
                'currentPrice': gold_price,
                'priceChange': round(realtime_change, 2),
                'priceChangePercent': round(realtime_change_percent, 2),
                'lastUpdated': datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC'),
                'isRealtime': data_source != 'fallback',
                'dataSource': data_source
            }
            
            # Update the first prediction's change based on live price
            if predictions:
                predictions[0]['change'] = round(predictions[0]['price'] - gold_price, 2)
                predictions[0]['changePct'] = round((predictions[0]['change'] / gold_price) * 100, 2)

        except Exception as rt_error:
            # Fallback to static price if real-time calculation fails
            realtime_data = {
                'currentPrice': round(last_actual_price, 2),
                'priceChange': 0,
                'priceChangePercent': 0,
                'lastUpdated': datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC'),
                'isRealtime': False
            }

        response = {
            'success': True,
            'currentPrice': round(gold_price, 2),
            'currentMonth': datetime.now().strftime('%B %Y'),
            'realtimeData': realtime_data,
            'predictions': predictions,
            'recentHistory': recent_history,
            'summary': {
                'averagePrice': avg_predicted,
                'minPrice': min_predicted,
                'maxPrice': max_predicted,
                'expectedChange': expected_change,
                'expectedChangePct': expected_change_pct
            }
        }
        
        return jsonify(response)
    
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'service': 'Gold Prediction API'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=False, load_dotenv=False)
