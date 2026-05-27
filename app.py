import re
from flask import Flask, render_template, url_for, request, redirect
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()
login_manager = LoginManager()

class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)

    def __repr__(self):
        return f"<User {self.username}>"

def createApp():

    app = Flask(__name__)
    app.config['SECRET_KEY'] = 'dev_secret_key'
    app.config['SQLALCHEMY_DATABASE_URI'] = "sqlite:///app.db"
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    db.init_app(app)
    login_manager.init_app(app)
    login_manager.login_view = "login"

    with app.app_context():
        db.create_all()

    @app.route("/health/db")
    def health_check():
        try:
            db.session.execute(text("SELECT 1"))
            return {"db": "ok"}, 200
        except Exception as e:
            return {"db": "error", "detail": str(e)}, 500

    @app.get("/")
    def index():
        return render_template("index.html")
    
    @app.route("/register", methods=["GET", "POST"])
    def register():
        if request.method == "GET":
            return render_template("register.html")
        
        errors = []

        username = (request.form.get("username") or "").strip()
        email = (request.form.get("email") or "").strip()
        password = request.form.get("password") or ""
        confirm = request.form.get("confirm_password") or ""

        if not (3 <= len(username) <=80):
            errors.append("Username length 3-80 characters")
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
            errors.append("Email format not correct")
        if len(password) < 6:
            errors.append("Password atleast 6 chars")
        if password != confirm:
            errors.append("Passwords not matching")

        if not errors:
            try:
                pw_hash = generate_password_hash(password)
                user = User(username=username, email=email, password_hash=pw_hash)
                db.session.add(user)
                db.session.commit()

                return redirect(url_for('login'))
            except IntegrityError:
                db.session.rollback()
                errors.append("Username/Email is already registered!")

        return render_template("register.html", errors=errors)
    
    @app.route("/dashboard")
    def dashboard():
        return render_template("dashboard.html")    
    
    @app.route("/login", methods=["GET", "POST"])
    def login():
        errors = []
        if request.method == "POST":
            email = (request.form.get("email") or "").strip()
            password = request.form.get("password") or ""

            if not email:
                errors.append("Email is required!")
            if not password:
                errors.append("Password is required!")
            if not errors:
                user = User.query.filter_by(email=email).first()
                if not user or not check_password_hash(user.password_hash, password):
                    errors.append("Invalid Email or Password!")
                else:
                    login_user(user)
                    return redirect(url_for("dashboard"))

        return render_template("login.html", errors=errors)
    
    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))

    return app

if __name__ == "__main__":
    app = createApp()
    app.run(debug=True, port=8000)