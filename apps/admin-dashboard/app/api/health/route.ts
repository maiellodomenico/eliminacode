export async function GET(){
  return Response.json({ok:true, service:'eliminacode-admin-dashboard', time:new Date().toISOString()});
}
