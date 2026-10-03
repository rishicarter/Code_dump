export default function App() {
    const data = [{
            id: 1,
            name: "Fiat"
        },
        {
            id: 2,
            name: "Peugeot"
        },
        {
            id: 3,
            name: "Ford"
        },
        {
            id: 4,
            name: "Renault"
        },
        {
            id: 5,
            name: "Citroen"
        }
    ]
    return (
        <div className="bg-purple-800 text-white min-h-screen p-4 flex 
flex-col items-center">
            <div className="mb-4 space-y-5">
                <h2>Your budget is {budget}</h2>
                <label htmlFor="budget">Budget : </label>
                <input type="number" className="text-black" step={1000} 
id="budget" value={budget} onChange={(e) => setBudget(e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-4">
                {data.filter((el) => el.price <= budget).map((el) => {
                    return (
                        <Card car={el} key={el.id} />
                    )
                }
                )}
</div>
</div >
);
}

// export default function App() {
// return (
// <div className="bg-purple-800 text-white min-h-screen p-4 flex 
// flex-col justify-center  items-center">
// <h1 className="text-3xl font-thin">
//   HI
// </h1>
// </div>
// )
// }