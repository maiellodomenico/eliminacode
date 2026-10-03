const demo = [
  ['Ticket oggi','428'],
  ['In attesa','37'],
  ['Attesa media','8 min'],
  ['Feedback buoni','91%']
];

export default function Home(){
 return <main className="wrap">
   <div className="hero"><div><h1>Panoramica</h1><div className="muted">Supermercato Demo · dati dimostrativi</div></div><span className="badge">Sistema online</span></div>
   <section className="grid">{demo.map(([k,v])=><div className="card" key={k}><div className="muted">{k}</div><div className="metric">{v}</div></div>)}</section>
   <h2 style={{marginTop:32}}>Reparti</h2>
   <table className="table"><thead><tr><th>Reparto</th><th>In servizio</th><th>In attesa</th><th>Attesa</th></tr></thead><tbody>
   <tr><td>Salumeria</td><td>S042</td><td>11</td><td>12 min</td></tr>
   <tr><td>Macelleria</td><td>M018</td><td>5</td><td>7 min</td></tr>
   <tr><td>Panetteria</td><td>P064</td><td>8</td><td>5 min</td></tr>
   </tbody></table>
 </main>
}
