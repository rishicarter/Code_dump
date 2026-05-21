from flask import Flask, render_template, url_for

app = Flask(__name__)

# @app.get("/")
# def home():
#     return "Hello from Flask"

@app.get("/")
def index():
    return render_template("index.html")

if __name__ == "__main__":
    app.run(debug=True, port=8000)