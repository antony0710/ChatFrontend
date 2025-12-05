#restart pm2 of the node script
#The name of the pm2 process is assumed to be 'backend'
pm2 reload all
pm2 logs backend --lines 100