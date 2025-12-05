#install dependencies
npm install 

#build the project
npm run build

#copy built files to web server directory
sudo cp -r /root/ChatFrontend/dist /var/www/ChatFrontend

#restart web server to apply changes
sudo systemctl restart nginx
echo "Deployment completed successfully."
